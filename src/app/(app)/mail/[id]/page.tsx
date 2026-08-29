import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AlertCircle, FileText, Image as ImageIcon } from "lucide-react";
import { CampaignActions } from "./campaign-actions";
import { LiveRefresh } from "./live-refresh";
import { CampaignProgress } from "../campaign-progress";
import { BackLink } from "@/components/layout/back-link";
import { PageHeader } from "@/components/layout/page-header";
import { TableLink } from "@/components/data-table/table-link";
import { CampaignStatusBadge, RecipientStatusBadge } from "@/components/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBytes } from "@/lib/mail/attachments";
import { formatDateOnly } from "@/lib/dates";
import { getCampaign } from "@/lib/mail/queries";

/** Always read fresh — this page is watched while a send is in progress. */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const campaign = await getCampaign((await params).id);
  return { title: campaign ? `${campaign.subject} — Hide & Weave` : "Mailing — Hide & Weave" };
}

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const campaign = await getCampaign((await params).id);
  if (!campaign) notFound();

  const { counts } = campaign;
  // Polling follows whether anything is *working*, not whether anything is
  // left: a campaign parked with an error still has PENDING recipients, and
  // refreshing every few seconds would never show it change. QUEUED counts as
  // working only until an error lands on it, which covers the moment between
  // creating a campaign and the loop flipping it to SENDING.
  const inFlight =
    campaign.status === "SENDING" || (campaign.status === "QUEUED" && !campaign.error);

  return (
    <>
      <LiveRefresh active={inFlight} />
      <BackLink href="/mail">Mail</BackLink>

      <PageHeader
        title={campaign.subject}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <CampaignStatusBadge status={campaign.status} />
            <span>
              Written {formatDateOnly(campaign.createdAt)}
              {campaign.finishedAt ? ` · finished ${formatDateOnly(campaign.finishedAt)}` : ""}
            </span>
          </span>
        }
        actions={
          <CampaignActions
            id={campaign.id}
            pendingCount={counts.PENDING}
            failedCount={counts.FAILED}
          />
        }
      />

      {campaign.error ? (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div>
            <p className="font-medium">This mailing stopped before it finished.</p>
            <p className="mt-0.5">{campaign.error}</p>
          </div>
        </div>
      ) : null}

      <div className="mb-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="rounded-lg border">
          <div className="border-b bg-muted/40 px-4 py-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              What was sent
            </p>
          </div>
          {campaign.cc ? (
            <p className="border-b px-4 py-2 text-sm">
              <span className="text-muted-foreground">Cc </span>
              {campaign.cc}
            </p>
          ) : null}

          {/* The template, not any one person's copy — the substituted name for
              each recipient is in the table below. */}
          <p className="whitespace-pre-wrap px-4 py-3 text-sm">{campaign.body}</p>

          {campaign.attachments.length > 0 ? (
            <ul className="space-y-1 border-t px-4 py-3">
              {campaign.attachments.map((attachment) => (
                <li key={attachment.id} className="flex items-center gap-2 text-sm">
                  {attachment.contentType.startsWith("image/") ? (
                    <ImageIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  ) : (
                    <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1 truncate">{attachment.filename}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatBytes(attachment.size)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="rounded-lg border p-4">
          <CampaignProgress campaign={campaign} />
        </div>
      </div>

      <div className="rounded-lg border">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Sent to</TableHead>
                <TableHead>Addressed as</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaign.recipients.map((recipient) => (
                <TableRow key={recipient.id}>
                  <TableCell className="max-w-48">
                    {/* The name is the one recorded at send time. It only links
                        out while the client record still exists. */}
                    {recipient.clientId ? (
                      <TableLink
                        href={`/clients/${recipient.clientId}`}
                        title={recipient.clientName}
                      >
                        <span className="block truncate">{recipient.clientName}</span>
                      </TableLink>
                    ) : (
                      <span className="block truncate text-muted-foreground">
                        {recipient.clientName}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="break-all text-muted-foreground">
                    {recipient.email}
                  </TableCell>
                  <TableCell>{recipient.greeting}</TableCell>
                  <TableCell>
                    <RecipientStatusBadge status={recipient.status} />
                  </TableCell>
                  <TableCell className="max-w-72 text-xs text-muted-foreground">
                    {recipient.error ? (
                      <span className="text-destructive">{recipient.error}</span>
                    ) : recipient.sentAt ? (
                      formatDateOnly(recipient.sentAt)
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </>
  );
}
