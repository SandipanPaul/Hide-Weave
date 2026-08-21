"use server";

import { revalidatePath } from "next/cache";
import type {
  DuplicateDecision,
  DuplicateMatch,
  ImportOutcome,
  ImportPayloadRow,
} from "@/lib/csv/types";
import {
  lookupKey,
  projectCsvColumnFor,
  projectRowInput,
  resolveReferences,
  type NamedRecord,
} from "@/lib/csv/configs/projects";
import { foldCase } from "@/lib/keys";
import { ImportRowError, runImport } from "@/lib/csv/import-runner";
import { dateOnlyToUtc } from "@/lib/dates";
import { notDeleted, prisma } from "@/lib/db";
import { projectInputSchema } from "@/lib/schemas";

/**
 * Server half of the Projects CSV import.
 *
 * The browser previews with the same config and the same Zod schema used here,
 * but nothing it says is trusted: names are resolved again and every row is
 * validated again below before it reaches the database.
 */

/** The clients and exporters a row may name, indexed for lookup. */
async function loadReferenceIndexes() {
  const [clients, exporters] = await Promise.all([
    prisma.client.findMany({ where: notDeleted, select: { id: true, name: true } }),
    prisma.exporter.findMany({ where: notDeleted, select: { id: true, companyName: true } }),
  ]);

  const index = (records: NamedRecord[]) => {
    const map = new Map<string, NamedRecord>();
    for (const record of records) {
      const key = lookupKey(record.name);
      if (!map.has(key)) map.set(key, record);
    }
    return map;
  };

  return {
    clients: index(clients),
    exporters: index(
      exporters.map((exporter) => ({ id: exporter.id, name: exporter.companyName })),
    ),
  };
}

/**
 * Finds rows that collide with an existing project by order ID, and rows that
 * repeat an order ID earlier in the same file.
 */
export async function checkProjectDuplicates(
  rows: ImportPayloadRow[],
): Promise<DuplicateMatch[]> {
  const existing = await prisma.project.findMany({
    where: notDeleted,
    select: { id: true, orderId: true },
  });

  const byOrderId = new Map(existing.map((project) => [foldCase(project.orderId), project]));
  const matches: DuplicateMatch[] = [];
  const seen = new Map<string, number>();

  for (const row of rows) {
    const orderId = row.mapped.orderId ? foldCase(row.mapped.orderId) : "";
    if (!orderId) continue;

    const hit = byOrderId.get(orderId);
    if (hit) {
      matches.push({
        rowIndex: row.index,
        existingId: hit.id,
        existingLabel: hit.orderId,
        matchedOn: "order ID",
      });
      continue;
    }

    // Not in the database — but is it earlier in this same file?
    const earlier = seen.get(orderId);
    if (earlier !== undefined) {
      matches.push({
        rowIndex: row.index,
        existingId: "",
        existingLabel: `row ${earlier} of this file`,
        matchedOn: "order ID",
      });
    } else {
      seen.set(orderId, row.index);
    }
  }

  return matches;
}

/**
 * Imports the rows in a single transaction. If any row fails, nothing is
 * written and the offending row number comes back — a half-imported file is
 * worse than none.
 */
export async function importProjects(
  rows: ImportPayloadRow[],
  decisions: Record<number, DuplicateDecision>,
): Promise<ImportOutcome> {
  const indexes = await loadReferenceIndexes();

  const outcome = await runImport(rows, decisions, async (tx, row, decision) => {
    // Resolve the named references again server-side: the browser's lookup
    // was a convenience, and the clients may have changed since.
    const references = resolveReferences(row.mapped, indexes.clients, indexes.exporters);
    const firstIssue = references.issues[0];
    if (firstIssue) {
      throw new ImportRowError(row.index, `${firstIssue.field}: ${firstIssue.message}`);
    }

    const parsed = projectInputSchema.safeParse(
      projectRowInput(row.mapped, references.clientId, references.exporterId),
    );
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = issue?.path.join(".");
      throw new ImportRowError(
        row.index,
        issue ? `${field ? projectCsvColumnFor(field) : "row"}: ${issue.message}` : "Invalid row.",
      );
    }

    const { orderDate, expectedDelivery, actualDelivery, exporterId, ...rest } = parsed.data;
    const data = {
      ...rest,
      exporterId: exporterId || null,
      orderDate: dateOnlyToUtc(orderDate),
      expectedDelivery: expectedDelivery ? dateOnlyToUtc(expectedDelivery) : null,
      actualDelivery: actualDelivery ? dateOnlyToUtc(actualDelivery) : null,
    };

    if (decision === "update") {
      const target = await tx.project.findFirst({
        where: { ...notDeleted, orderId: parsed.data.orderId },
        select: { id: true },
      });
      if (!target) {
        // It vanished between the preview and the confirm.
        throw new ImportRowError(
          row.index,
          "the matching project no longer exists — re-run the import.",
        );
      }
      await tx.project.update({ where: { id: target.id }, data });
      return { outcome: "updated" };
    }

    await tx.project.create({ data });
    return { outcome: "created" };
  });

  if (outcome.ok) {
    revalidatePath("/projects");
    revalidatePath("/clients");
  }
  return outcome;
}
