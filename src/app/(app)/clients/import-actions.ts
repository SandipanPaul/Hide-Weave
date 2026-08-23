"use server";

import { revalidatePath } from "next/cache";
import type {
  DuplicateDecision,
  DuplicateMatch,
  ImportOutcome,
  ImportPayloadRow,
} from "@/lib/csv/types";
import { EMAIL_CONTACTS_SELECT, contactRows, findClientConflict, reserveClientCode } from "@/lib/clients/queries";
import { ImportRowError, runImport } from "@/lib/csv/import-runner";
import { foldCase } from "@/lib/keys";
import { clientRowInput, csvColumnFor } from "@/lib/csv/configs/clients";
import { emailKey, splitContacts } from "@/lib/contacts";
import { dateOnlyToUtc } from "@/lib/dates";
import { notDeleted, prisma } from "@/lib/db";
import { clientInputSchema } from "@/lib/schemas";

/**
 * Server half of the Clients CSV import.
 *
 * The browser previews with the same config and the same Zod schema used here,
 * but nothing it says is trusted: every row is validated again below before it
 * reaches the database.
 */

/**
 * Finds rows that collide with an existing client, by name or by email,
 * ignoring case and soft-deleted rows.
 *
 * Rows are also checked against each other, so a file containing the same
 * client twice is caught even though neither copy is in the database yet.
 */
export async function checkClientDuplicates(
  rows: ImportPayloadRow[],
): Promise<DuplicateMatch[]> {
  const existing = await prisma.client.findMany({
    where: notDeleted,
    select: { id: true, name: true, contacts: EMAIL_CONTACTS_SELECT },
  });

  const byName = new Map<string, { id: string; name: string }>();
  const byEmail = new Map<string, { id: string; name: string }>();
  for (const client of existing) {
    byName.set(foldCase(client.name), client);
    // Any one of a client's addresses identifies them.
    for (const contact of client.contacts) byEmail.set(emailKey(contact.value), client);
  }

  const matches: DuplicateMatch[] = [];
  const seenNames = new Map<string, number>();
  const seenEmails = new Map<string, number>();

  for (const row of rows) {
    const name = row.mapped.name ? foldCase(row.mapped.name) : undefined;
    // A cell may hold several addresses; any of them matching is a collision.
    const emails = splitContacts(row.mapped.email, "EMAIL").map(emailKey);

    const nameHit = name ? byName.get(name) : undefined;
    const emailHit = emails.map((email) => byEmail.get(email)).find(Boolean);
    const hit = nameHit ?? emailHit;

    if (hit) {
      matches.push({
        rowIndex: row.index,
        existingId: hit.id,
        existingLabel: hit.name,
        matchedOn: nameHit ? "name" : "email",
      });
      continue;
    }

    // Not in the database — but is it earlier in this same file?
    const earlierName = name ? seenNames.get(name) : undefined;
    const earlierEmail = emails.map((email) => seenEmails.get(email)).find((v) => v !== undefined);
    const earlier = earlierName ?? earlierEmail;
    if (earlier !== undefined) {
      matches.push({
        rowIndex: row.index,
        existingId: "",
        existingLabel: `row ${earlier} of this file`,
        matchedOn: earlierName !== undefined ? "name" : "email",
      });
    }

    if (name && !seenNames.has(name)) seenNames.set(name, row.index);
    for (const email of emails) if (!seenEmails.has(email)) seenEmails.set(email, row.index);
  }

  return matches;
}

/**
 * Imports the rows in a single transaction. If any row fails, nothing is
 * written and the offending row number comes back — a half-imported file is
 * worse than none.
 */
export async function importClients(
  rows: ImportPayloadRow[],
  decisions: Record<number, DuplicateDecision>,
): Promise<ImportOutcome> {
  const outcome = await runImport(rows, decisions, async (tx, row, decision) => {
    // Re-validate server-side with the very shape the preview judged. The
    // browser's verdict is a convenience, never the decision.
    const parsed = clientInputSchema.safeParse(clientRowInput(row.mapped));
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = issue?.path.join(".");
      throw new ImportRowError(
        row.index,
        issue ? `${field ? csvColumnFor(field) : "row"}: ${issue.message}` : "Invalid row.",
      );
    }

    const samplingDate = row.mapped.samplingDate;
    if (samplingDate !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(samplingDate)) {
      throw new ImportRowError(row.index, `sampling date: use the format YYYY-MM-DD.`);
    }

    const { phones, emails, ...fields } = parsed.data;
    const contacts = contactRows(phones, emails);

    let clientId: string;
    let outcome: "created" | "updated";

    if (decision === "update") {
      // The same duplicate rule the preview used, re-run inside the
      // transaction in case the database moved underneath it.
      const match = await findClientConflict({ name: parsed.data.name, emails }, tx);
      if (!match) {
        // It vanished between the preview and the confirm.
        throw new ImportRowError(
          row.index,
          "the matching client no longer exists — re-run the import.",
        );
      }
      await tx.clientContact.deleteMany({ where: { clientId: match.id } });
      await tx.client.update({
        where: { id: match.id },
        data: { ...fields, contacts: { create: contacts } },
      });
      clientId = match.id;
      outcome = "updated";
    } else {
      const client = await tx.client.create({
        data: {
          ...fields,
          // Read inside the transaction, so a run that imports several new
          // clients numbers them in sequence rather than issuing one code
          // repeatedly.
          code: await reserveClientCode(tx),
          contacts: { create: contacts },
        },
      });
      clientId = client.id;
      outcome = "created";
    }

    if (samplingDate === undefined) return { outcome };

    await tx.clientSampling.create({
      data: {
        clientId,
        scheduledDate: dateOnlyToUtc(samplingDate),
        status: "SCHEDULED",
        // The client CSV carries a sampling date but no product; it can be
        // filled in on the client's page afterwards.
        product: null,
      },
    });
    return { outcome, extras: 1 };
  });

  if (outcome.ok) revalidatePath("/clients");
  return outcome;
}
