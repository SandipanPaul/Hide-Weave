import "server-only";
import { notDeleted, prisma } from "@/lib/db";
import { greetingFor } from "@/lib/mail/template";
import type { CampaignStatus, ClientStatus, RecipientStatus } from "@/lib/enums";

/** Reads for the Mail tab. */

export type MailableClient = {
  id: string;
  code: string | null;
  name: string;
  status: ClientStatus;
  country: string | null;
  /** The first address on the client — the one the campaign would use. */
  email: string;
  /** What `<name>` would become for them, resolved here so the picker shows it. */
  greeting: string;
  /** True when the greeting is the company name because nobody is named. */
  isCompanyGreeting: boolean;
};

/**
 * Every client that can be written to, in name order.
 *
 * Loaded whole rather than paged: choosing recipients means comparing the
 * list against itself and selecting across the whole of it, and a few hundred
 * rows of four short fields is not worth a paging control that would make
 * "select all" mean "select all on this page".
 *
 * Clients with no email address are absent — there is nothing to send to.
 */
export async function getMailableClients(): Promise<MailableClient[]> {
  const clients = await prisma.client.findMany({
    where: {
      ...notDeleted,
      contacts: { some: { ...notDeleted, kind: "EMAIL" } },
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
      country: true,
      contactPerson: true,
      contacts: {
        where: { ...notDeleted, kind: "EMAIL" },
        orderBy: { position: "asc" },
        take: 1,
        select: { value: true },
      },
    },
  });

  return clients.flatMap((client) => {
    const email = client.contacts[0]?.value;
    if (!email) return [];
    const greeting = greetingFor(client);
    return [
      {
        id: client.id,
        code: client.code,
        name: client.name,
        status: client.status as ClientStatus,
        country: client.country,
        email,
        greeting,
        isCompanyGreeting: greeting === client.name.trim(),
      },
    ];
  });
}

export type CampaignCounts = Record<RecipientStatus, number>;

export type CampaignSummary = {
  id: string;
  subject: string;
  status: CampaignStatus;
  error: string | null;
  createdAt: Date;
  finishedAt: Date | null;
  total: number;
  counts: CampaignCounts;
};

function emptyCounts(): CampaignCounts {
  return { PENDING: 0, SENT: 0, FAILED: 0 };
}

/**
 * Counts per status for a set of campaigns, in one grouped query rather than
 * one query per campaign.
 */
async function loadCounts(campaignIds: string[]): Promise<Map<string, CampaignCounts>> {
  const counts = new Map<string, CampaignCounts>();
  if (campaignIds.length === 0) return counts;

  const groups = await prisma.campaignRecipient.groupBy({
    by: ["campaignId", "status"],
    where: { campaignId: { in: campaignIds } },
    _count: { _all: true },
  });

  for (const group of groups) {
    const entry = counts.get(group.campaignId) ?? emptyCounts();
    if (group.status in entry) entry[group.status as RecipientStatus] = group._count._all;
    counts.set(group.campaignId, entry);
  }
  return counts;
}

function summarize(
  campaign: {
    id: string;
    subject: string;
    status: string;
    error: string | null;
    createdAt: Date;
    finishedAt: Date | null;
  },
  counts: CampaignCounts,
): CampaignSummary {
  return {
    ...campaign,
    status: campaign.status as CampaignStatus,
    counts,
    total: counts.PENDING + counts.SENT + counts.FAILED,
  };
}

/** Campaigns newest first — the last thing sent is the thing being checked on. */
export async function getCampaigns(): Promise<CampaignSummary[]> {
  const campaigns = await prisma.campaign.findMany({
    where: notDeleted,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      subject: true,
      status: true,
      error: true,
      createdAt: true,
      finishedAt: true,
    },
  });

  const counts = await loadCounts(campaigns.map((campaign) => campaign.id));
  return campaigns.map((campaign) =>
    summarize(campaign, counts.get(campaign.id) ?? emptyCounts()),
  );
}

export type CampaignRecipientRow = {
  id: string;
  clientId: string | null;
  clientName: string;
  email: string;
  greeting: string;
  status: RecipientStatus;
  error: string | null;
  sentAt: Date | null;
};

export type CampaignDetail = CampaignSummary & {
  body: string;
  /** Addresses copied on every message, as typed. Null when nobody was. */
  cc: string | null;
  recipients: CampaignRecipientRow[];
  /** Metadata only — the bytes are never read for display. */
  attachments: { id: string; filename: string; contentType: string; size: number }[];
};

export async function getCampaign(id: string): Promise<CampaignDetail | null> {
  const campaign = await prisma.campaign.findFirst({
    where: { id, ...notDeleted },
    select: {
      id: true,
      subject: true,
      body: true,
      cc: true,
      status: true,
      error: true,
      createdAt: true,
      finishedAt: true,
      recipients: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          clientId: true,
          clientName: true,
          email: true,
          greeting: true,
          status: true,
          error: true,
          sentAt: true,
        },
      },
      // `content` is deliberately absent: this feeds a page, and selecting the
      // blob would read every attached megabyte to render a filename.
      attachments: {
        orderBy: { position: "asc" },
        select: { id: true, filename: true, contentType: true, size: true },
      },
    },
  });
  if (!campaign) return null;

  const counts = emptyCounts();
  for (const recipient of campaign.recipients) {
    if (recipient.status in counts) counts[recipient.status as RecipientStatus] += 1;
  }

  const { body, cc, recipients, attachments, ...rest } = campaign;
  return {
    ...summarize(rest, counts),
    body,
    cc,
    attachments,
    recipients: recipients.map((recipient) => ({
      ...recipient,
      status: recipient.status as RecipientStatus,
    })),
  };
}
