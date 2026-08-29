"use client";

import { deleteCampaign } from "./actions";
import { CampaignProgress } from "./campaign-progress";
import { RowActions } from "@/components/data-table/row-actions";
import { TableLink } from "@/components/data-table/table-link";
import { CampaignStatusBadge } from "@/components/status-badge";
import { useAction } from "@/components/form/use-action";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateOnly } from "@/lib/dates";
import type { CampaignSummary } from "@/lib/mail/queries";

export function CampaignsTable({ rows }: { rows: CampaignSummary[] }) {
  const { run, pending } = useAction();

  return (
    <div className="rounded-lg border">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Subject</TableHead>
              <TableHead>Written</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead className="w-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((campaign) => (
              <TableRow key={campaign.id}>
                <TableCell className="max-w-xs">
                  <TableLink href={`/mail/${campaign.id}`} title={campaign.subject}>
                    <span className="block truncate">{campaign.subject}</span>
                  </TableLink>
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {formatDateOnly(campaign.createdAt)}
                </TableCell>
                <TableCell>
                  <CampaignStatusBadge status={campaign.status} />
                </TableCell>
                <TableCell className="min-w-56">
                  <CampaignProgress campaign={campaign} />
                </TableCell>
                <TableCell>
                  <RowActions
                    deleteLabel={`Remove the record of “${campaign.subject}”`}
                    confirmTitle="Remove this mailing?"
                    confirmDescription={
                      campaign.counts.PENDING > 0
                        ? `${campaign.counts.PENDING} of these have not been sent yet — removing the mailing stops them going out. The ${campaign.counts.SENT} already sent cannot be recalled.`
                        : "This removes the record of who was written to. The mail itself has already been sent and is unaffected."
                    }
                    confirmLabel="Remove it"
                    pending={pending}
                    onDelete={() =>
                      run(() => deleteCampaign(campaign.id), "Mailing removed.")
                    }
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
