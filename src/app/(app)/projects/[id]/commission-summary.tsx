import { Card, CardContent } from "@/components/ui/card";

/**
 * The headline figures for one order. Commission is the largest thing on the
 * page because it is the only one of these numbers that is the agent's income
 * — the order value is goods routed through them and is labelled as such.
 */
export function CommissionSummary({
  commissionDisplay,
  orderValueDisplay,
  commissionPercentage,
  paidDisplay,
  outstandingDisplay,
  overpaidDisplay,
  percentPaid,
  settled,
}: {
  commissionDisplay: string;
  orderValueDisplay: string;
  commissionPercentage: number;
  paidDisplay: string;
  outstandingDisplay: string;
  overpaidDisplay: string | null;
  percentPaid: number;
  settled: boolean;
}) {
  // A part payment past 100% would otherwise run the bar off its track.
  const barWidth = Math.min(100, Math.max(0, percentPaid));

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Commission earned
            </p>
            <p className="mt-0.5 text-3xl font-semibold tabular-nums">{commissionDisplay}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {commissionPercentage}% of {orderValueDisplay} routed
            </p>
          </div>

          <dl className="flex gap-8 text-sm">
            <div>
              <dt className="text-muted-foreground">Received</dt>
              <dd className="mt-0.5 font-medium tabular-nums">{paidDisplay}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">
                {overpaidDisplay ? "Overpaid" : "Outstanding"}
              </dt>
              <dd
                className={`mt-0.5 font-medium tabular-nums ${
                  settled ? "text-emerald-700 dark:text-emerald-500" : ""
                }`}
              >
                {overpaidDisplay ?? outstandingDisplay}
              </dd>
            </div>
          </dl>
        </div>

        <div>
          <div
            className="h-2 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={Math.round(barWidth)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Commission settled"
          >
            <div
              className={`h-full rounded-full transition-all ${
                settled ? "bg-emerald-600 dark:bg-emerald-500" : "bg-primary"
              }`}
              style={{ width: `${barWidth}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {settled
              ? "Settled in full."
              : `${Math.round(percentPaid)}% of the commission received. Payments settle the commission, not the order value.`}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
