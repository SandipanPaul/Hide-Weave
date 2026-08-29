"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { notDeleted, prisma } from "@/lib/db";
import { greetingFor } from "@/lib/mail/template";
import { parseExtraRecipients, withoutClientAddresses } from "@/lib/mail/recipients";
import { checkAttachments, resolveContentType } from "@/lib/mail/attachments";
import { deleteAttachments, writeAttachment } from "@/lib/mail/attachment-store";
import { runCampaign } from "@/lib/mail/send";
import { isMailConfigured } from "@/lib/mail/settings";
import { campaignInputSchema, failure, invalid, type ActionResult } from "@/lib/schemas";

/**
 * Writes for the Mail tab.
 *
 * Sending is the one action in this app that leaves the building and cannot be
 * undone, so the work is split in two: this file decides *who* gets written to
 * and records that decision, and src/lib/mail/send.ts does the sending. The
 * recipient rows exist before the first message goes out, which is what makes
 * a campaign auditable while it is still running and resumable after a crash.
 */

function revalidateMail(id?: string) {
  revalidatePath("/mail");
  if (id) revalidatePath(`/mail/${id}`);
}

/**
 * Starts the send without blocking the response.
 *
 * `after` runs the loop once the page has been handed back, so the user lands
 * on the campaign and watches it progress instead of staring at a spinner for
 * two minutes. This app runs as a long-lived Node process under systemd, so
 * there is no request timeout to cut the loop short — and if the process does
 * restart, the PENDING rows survive and Resume picks them up.
 */
function startSending(campaignId: string) {
  after(() => runCampaign(campaignId));
}

export async function createCampaign(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  if (!(await isMailConfigured())) {
    return failure("Mail is not set up yet. Add the account details on the settings page.");
  }

  const parsed = campaignInputSchema.safeParse({
    subject: formData.get("subject"),
    body: formData.get("body"),
    clientIds: formData.getAll("clientId"),
    extraEmails: formData.get("extraEmails"),
    cc: formData.get("cc"),
  });
  if (!parsed.success) return invalid(parsed.error);

  const { subject, body, clientIds, extraEmails, cc } = parsed.data;

  // Parsed with the same function as the recipient list, so "Jane <j@x.com>"
  // works here too — only the address is used, since a CC header carries no
  // personalisation.
  const { recipients: ccParsed, invalid: badCc } = parseExtraRecipients(cc);
  if (badCc.length > 0) {
    return failure(`These are not email addresses: ${badCc.join(", ")}.`, "cc");
  }
  const ccAddresses = ccParsed.map((entry) => entry.email);

  // Re-read the clients rather than trusting anything the form said about
  // them: addresses and names are resolved from the record as it stands now.
  const clients = clientIds.length === 0 ? [] : await prisma.client.findMany({
    where: {
      id: { in: clientIds },
      ...notDeleted,
      contacts: { some: { ...notDeleted, kind: "EMAIL" } },
    },
    select: {
      id: true,
      name: true,
      contactPerson: true,
      contacts: {
        where: { ...notDeleted, kind: "EMAIL" },
        orderBy: { position: "asc" },
        take: 1,
        select: { value: true },
      },
    },
  });

  const recipients: {
    clientId: string | null;
    email: string;
    greeting: string;
    clientName: string;
  }[] = clients.flatMap((client) => {
    const email = client.contacts[0]?.value;
    if (!email) return [];
    return [
      {
        clientId: client.id,
        email,
        greeting: greetingFor(client),
        clientName: client.name,
      },
    ];
  });

  // Typed addresses go last, after the clients, and never twice: one that a
  // chosen client already covers is dropped rather than sent a second copy.
  const { recipients: typed, invalid: badAddresses } = parseExtraRecipients(extraEmails);
  if (badAddresses.length > 0) {
    return failure(
      `These are not email addresses: ${badAddresses.join(", ")}. Fix or remove them.`,
      "extraEmails",
    );
  }

  for (const extra of withoutClientAddresses(typed, recipients.map((r) => r.email))) {
    recipients.push({
      clientId: null,
      email: extra.email,
      greeting: extra.greeting,
      // Kept as the label so the campaign log reads as a name where one was
      // given, and as the address where one was not.
      clientName: extra.label,
    });
  }

  if (recipients.length === 0) {
    return failure(
      clientIds.length > 0
        ? "None of the chosen clients has an email address any more. Nothing was sent."
        : "Choose at least one client, or type an address to write to.",
      "clientIds",
    );
  }

  // Read before the write so a rejected file stops the mailing rather than
  // producing a campaign that goes out missing its catalogue.
  const files = formData.getAll("attachment").filter((entry): entry is File => entry instanceof File);
  const { problems } = checkAttachments(files);
  if (problems.length > 0) {
    return failure(
      problems
        .map((problem) => (problem.filename ? `${problem.filename}: ${problem.reason}` : problem.reason))
        .join(" · "),
      "attachments",
    );
  }

  // Ids are minted here rather than by the database, because the bytes are
  // written to disk under the id and that has to happen before the row exists —
  // a row pointing at a file that failed to write would be a campaign that
  // silently sends without its catalogue.
  const attachments = files.map((file, position) => ({
    id: randomUUID(),
    filename: file.name,
    contentType: resolveContentType(file),
    size: file.size,
    position,
  }));

  try {
    await Promise.all(
      attachments.map(async (attachment, index) =>
        writeAttachment(attachment.id, Buffer.from(await files[index]!.arrayBuffer())),
      ),
    );
  } catch {
    await deleteAttachments(attachments.map((attachment) => attachment.id));
    return failure("Could not save the attachments. Please try again.", "attachments");
  }

  let campaignId: string;
  try {
    const campaign = await prisma.campaign.create({
      data: {
        subject,
        body,
        cc: ccAddresses.length > 0 ? ccAddresses.join(", ") : null,
        status: "QUEUED",
        recipients: { create: recipients },
        attachments: { create: attachments },
      },
      select: { id: true },
    });
    campaignId = campaign.id;
  } catch {
    // Files without a row would sit on disk forever with nothing referring to
    // them.
    await deleteAttachments(attachments.map((attachment) => attachment.id));
    return failure("Could not queue this mailing. Please try again.");
  }

  startSending(campaignId);
  revalidateMail(campaignId);
  // Outside the try: redirect works by throwing, so catching here would turn a
  // successful send into "could not queue this mailing".
  redirect(`/mail/${campaignId}`);
}

/**
 * Picks a stalled campaign back up.
 *
 * Safe to press at any time: the loop only ever touches PENDING rows, so
 * resuming a campaign that is already finished sends nothing, and resuming one
 * that stopped halfway continues from where it stopped.
 */
export async function resumeCampaign(id: string): Promise<ActionResult> {
  if (!(await isMailConfigured())) {
    return failure("Mail is not set up yet. Add the account details on the settings page.");
  }

  const campaign = await prisma.campaign.findFirst({
    where: { id, ...notDeleted },
    select: { _count: { select: { recipients: { where: { status: "PENDING" } } } } },
  });
  if (!campaign) return failure("This mailing no longer exists.");
  if (campaign._count.recipients === 0) {
    return failure("Every recipient has already been attempted.");
  }

  startSending(id);
  revalidateMail(id);
  return { ok: true, data: undefined };
}

/**
 * Puts the failed recipients of a campaign back in the queue.
 *
 * A separate action from Resume because it changes history: a row that failed
 * is being given another go, and the error it recorded is cleared. Only ever
 * touches FAILED rows, so a client who received the mail cannot be sent it
 * twice by pressing this.
 */
export async function retryFailed(id: string): Promise<ActionResult> {
  if (!(await isMailConfigured())) {
    return failure("Mail is not set up yet. Add the account details on the settings page.");
  }

  const { count } = await prisma.campaignRecipient.updateMany({
    where: { campaignId: id, status: "FAILED" },
    data: { status: "PENDING", error: null },
  });
  if (count === 0) return failure("There is nothing to retry.");

  startSending(id);
  revalidateMail(id);
  return { ok: true, data: undefined };
}

/**
 * Soft-deletes the record of a mailing.
 *
 * Removes the log, never the mail — anything already sent has been sent. But a
 * campaign still working through its list stops within a message or so, so
 * this doubles as the way to abort a mailing that should not have started.
 *
 * The recipient rows stay attached to the hidden campaign rather than being
 * cleared, so a deletion can be undone in the database if it was a mistake.
 */
export async function deleteCampaign(id: string): Promise<ActionResult> {
  try {
    const attachments = await prisma.campaignAttachment.findMany({
      where: { campaignId: id },
      select: { id: true },
    });

    await prisma.campaign.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    // The record of what was attached stays with the hidden campaign; the bytes
    // do not, since nothing will ever send them again.
    await deleteAttachments(attachments.map((attachment) => attachment.id));
    revalidateMail();
    return { ok: true, data: undefined };
  } catch {
    return failure("Could not remove this mailing. Please try again.");
  }
}
