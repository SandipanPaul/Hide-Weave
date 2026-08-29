import { cn } from "@/lib/utils";
import type { CampaignSummary } from "@/lib/mail/queries";

/**
 * How far a mailing has got, as a bar and a sentence.
 *
 * Failures are drawn in the bar rather than only counted beside it, because a
 * campaign that "finished" with a third of it in red should not look the same
 * at a glance as one that finished clean.
 */
export function CampaignProgress({ campaign }: { campaign: CampaignSummary }) {
  const { counts, total } = campaign;
  if (total === 0) return <span className="text-sm text-muted-foreground">No recipients</span>;

  const percent = (count: number) => `${(count / total) * 100}%`;

  return (
    <div className="space-y-1">
      <div
        className="flex h-1.5 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={`${counts.SENT} sent, ${counts.FAILED} failed, ${counts.PENDING} still to go, of ${total}`}
      >
        <div className="bg-primary" style={{ width: percent(counts.SENT) }} />
        <div className="bg-destructive" style={{ width: percent(counts.FAILED) }} />
      </div>
      <p className="text-xs text-muted-foreground">
        {counts.SENT} of {total} sent
        {counts.FAILED > 0 ? (
          <span className={cn("text-destructive")}> · {counts.FAILED} failed</span>
        ) : null}
        {counts.PENDING > 0 ? <span> · {counts.PENDING} to go</span> : null}
      </p>
    </div>
  );
}
