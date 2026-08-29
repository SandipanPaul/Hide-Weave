import "server-only";
import { prisma } from "@/lib/db";
import { readAttachment } from "@/lib/mail/attachment-store";
import { renderBody, toHtml } from "@/lib/mail/template";
import { mailConfig } from "@/lib/mail/settings";
import { mailTransport, type MailConfig } from "@/lib/mail/transport";

/**
 * Working through one campaign's recipients, one message at a time.
 *
 * The loop is driven by the database rather than by an in-memory list: each
 * turn asks for the next PENDING recipient and marks it SENT or FAILED before
 * moving on. That is what makes a half-finished campaign resumable — if the
 * server restarts mid-send, the rows that already went are SENT, and starting
 * the campaign again simply continues from the next PENDING one. Nobody is
 * ever written to twice.
 */

/**
 * Gap between messages. Gmail throttles bursts and treats a fast loop as
 * suspicious; a second between sends puts a 100-client campaign at under two
 * minutes, which is well inside what anyone waits for.
 */
const DELAY_BETWEEN_SENDS_MS = 1000;

/**
 * Campaigns being processed in this process, so a double-click on Send cannot
 * start two loops over the same recipients. It is only a guard against this
 * process racing itself — correctness against a restart comes from the
 * PENDING-row query above, not from here.
 */
const running = new Set<string>();

/**
 * Errors that mean the connection is unusable rather than that one address was
 * rejected. Retrying the remaining recipients against a broken transport would
 * fail them all with the same message and, in the EAUTH case, hammer Gmail
 * with bad credentials — so the run stops and leaves them PENDING.
 */
const FATAL_CODES = new Set(["EAUTH", "ECONNECTION", "ESOCKET", "ETIMEDOUT", "EDNS"]);

function isFatal(error: unknown): boolean {
  const code = (error as { code?: unknown })?.code;
  return typeof code === "string" && FATAL_CODES.has(code);
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : "Unknown mail error.";
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sends every PENDING recipient of a campaign, then marks it completed.
 *
 * Returns immediately if another run is already working on this campaign.
 * Never throws: a campaign that cannot be sent records why and stays resumable,
 * because this is called from `after()` where a thrown error has no one to
 * report to.
 */
export async function runCampaign(campaignId: string): Promise<void> {
  if (running.has(campaignId)) return;
  running.add(campaignId);

  try {
    const config = await mailConfig();
    if (!config) {
      await stop(campaignId, "Mail is not configured. Add the account details in Mail settings.");
      return;
    }

    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, deletedAt: null },
      select: {
        id: true,
        subject: true,
        body: true,
        cc: true,
        attachments: {
          orderBy: { position: "asc" },
          select: { id: true, filename: true, contentType: true },
        },
      },
    });
    if (!campaign) return;

    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "SENDING", error: null },
    });

    await deliverPending(campaign, config);
  } catch (error) {
    // A failure outside the per-recipient try — a database error, most likely.
    await stop(campaignId, messageOf(error)).catch(() => {});
  } finally {
    running.delete(campaignId);
  }
}

async function deliverPending(
  campaign: {
    id: string;
    subject: string;
    body: string;
    cc: string | null;
    attachments: { id: string; filename: string; contentType: string }[];
  },
  config: MailConfig,
): Promise<void> {
  const transport = mailTransport(config);
  const from = `"${config.fromName}" <${config.user}>`;

  // Read from disk once for the whole campaign, not once per recipient: the
  // same bytes go to everyone, and re-reading 15 MB a hundred times would be
  // the slowest thing in the loop by a wide margin.
  const attachments: { filename: string; contentType: string; content: Buffer }[] = [];
  let attachmentBytes = 0;
  for (const attachment of campaign.attachments) {
    const content = await readAttachment(attachment.id);
    if (!content) {
      // Sending the mailing without the file it was written around would be
      // worse than not sending it: the message refers to something that is not
      // there, and it cannot be taken back.
      await stop(
        campaign.id,
        `The attachment “${attachment.filename}” is missing from disk, so nothing was sent. Attachments are not included in database backups.`,
      );
      return;
    }
    attachments.push({
      filename: attachment.filename,
      contentType: attachment.contentType,
      content,
    });
    attachmentBytes += content.length;
  }

  // Base64 inflates an attachment by about a third, and that is what actually
  // crosses the wire — for every recipient, separately.
  const encodedBytes = Math.round(attachmentBytes * 1.37);
  if (attachments.length > 0) {
    console.info(
      `[mail] campaign ${campaign.id}: ${attachments.length} attachment(s), ` +
        `${(attachmentBytes / 1024 / 1024).toFixed(1)} MB each, ~${(encodedBytes / 1024 / 1024).toFixed(1)} MB per message on the wire`,
    );
  }
  let first = true;

  for (;;) {
    // Re-checked every turn so that removing a campaign acts as a stop button:
    // the messages already sent cannot be recalled, but the rest never go.
    const live = await prisma.campaign.count({
      where: { id: campaign.id, deletedAt: null },
    });
    if (live === 0) return;

    const recipient = await prisma.campaignRecipient.findFirst({
      where: { campaignId: campaign.id, status: "PENDING" },
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true, greeting: true, clientId: true },
    });
    if (!recipient) break;

    // Paced between messages, not before the first — nobody should wait a
    // second to find out their credentials are wrong.
    if (!first) await sleep(DELAY_BETWEEN_SENDS_MS);
    first = false;

    const text = renderBody(campaign.body, recipient.greeting);
    const startedAt = Date.now();

    try {
      await transport.sendMail({
        from,
        to: recipient.email,
        subject: renderBody(campaign.subject, recipient.greeting),
        // The same header on every copy, so each client can see who else was
        // copied — which is what a CC is for, as against a BCC.
        ...(campaign.cc ? { cc: campaign.cc } : {}),
        text,
        html: toHtml(text),
        // Every recipient gets their own copy of the files. A 5 MB catalogue to
        // a hundred clients is 500 MB through SMTP, which is why the compose
        // screen says what a mailing will weigh before it is sent.
        ...(attachments.length > 0 ? { attachments } : {}),
      });
      await prisma.campaignRecipient.update({
        where: { id: recipient.id },
        data: { status: "SENT", sentAt: new Date(), error: null },
      });
      await markAsChasing(recipient.clientId);
      // Logged rather than stored: "why is this slow?" is a question about a
      // run, not about a record, and the answer is almost always the size of
      // the attachments times the number of people. Visible in `next dev`'s
      // console and in `journalctl -u hide-weave`.
      console.info(
        `[mail] sent to ${recipient.email} in ${Date.now() - startedAt}ms` +
          (attachmentBytes > 0
            ? ` (${(attachmentBytes / 1024 / 1024).toFixed(1)} MB of attachments, ~${(encodedBytes / 1024 / 1024).toFixed(1)} MB on the wire)`
            : ""),
      );
    } catch (error) {
      if (isFatal(error)) {
        // Left PENDING on purpose: the message was never refused, the
        // connection was. Resuming should try this address again.
        await stop(campaign.id, messageOf(error));
        return;
      }
      await prisma.campaignRecipient.update({
        where: { id: recipient.id },
        data: { status: "FAILED", error: messageOf(error).slice(0, 500) },
      });
    }
  }

  await prisma.campaign.update({
    where: { id: campaign.id },
    data: { status: "COMPLETED", finishedAt: new Date(), error: null },
  });
}

/**
 * Marks a client as being chased, now that something has been sent to them.
 *
 * ACTIVE clients are deliberately left alone: CHASING means "being pursued,
 * has not ordered yet", so moving someone with live orders into it would
 * misdescribe them and change what the Clients tab says at a glance. A client
 * already CHASING is matched by the same filter and simply rewritten to what
 * it already was.
 *
 * `updateMany` rather than `update` so the condition is part of the query — a
 * read-then-write could act on a status that changed in between.
 */
async function markAsChasing(clientId: string | null): Promise<void> {
  // Typed-in addresses have no client behind them.
  if (!clientId) return;
  await prisma.client.updateMany({
    where: { id: clientId, deletedAt: null, status: { not: "ACTIVE" } },
    data: { status: "CHASING" },
  });
}

/** Parks a campaign with a reason, leaving its PENDING recipients to resume. */
async function stop(campaignId: string, error: string): Promise<void> {
  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: "QUEUED", error: error.slice(0, 500) },
  });
}
