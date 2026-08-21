import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * One figure on the dashboard, with a line saying what it actually means.
 *
 * Every card carries that line on purpose: "order value routed" and
 * "commission earned" are wildly different numbers, and a reader glancing at
 * the biggest one should never come away thinking the agent earned it.
 */
export function StatCard({
  label,
  value,
  hint,
  emphasis = false,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  /** The headline figure, rendered larger than the rest. */
  emphasis?: boolean;
  tone?: "positive" | "warning";
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p
          className={cn(
            "mt-1 font-semibold tabular-nums",
            emphasis ? "text-3xl" : "text-2xl",
            tone === "positive" && "text-emerald-600 dark:text-emerald-500",
            tone === "warning" && "text-amber-600 dark:text-amber-500",
          )}
        >
          {value}
        </p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}
