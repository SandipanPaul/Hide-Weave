"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { EmptyState } from "@/components/layout/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney, majorNumberToMinor } from "@/lib/money";

/**
 * The dashboard's charts.
 *
 * Every value arrives as a plain number in major units, already converted on
 * the server: bigints cannot cross the server/client boundary, and a charting
 * library cannot take one anyway. Nothing here does arithmetic — the figures
 * were computed by the tested aggregates.
 */

export type MonthlyPoint = {
  month: string;
  label: string;
  orderValue: number;
  commission: number;
};
export type CashPoint = { month: string; label: string; amount: number };
export type RankedPoint = { label: string; commission: number };
export type StatusPoint = { label: string; count: number };

/** Greys, matching the app's chart tokens, plus one accent for the donut. */
const SLICE_COLORS = [
  "var(--chart-5)",
  "var(--chart-3)",
  "var(--chart-1)",
  "var(--chart-4)",
  "var(--chart-2)",
];

function ChartCard({
  title,
  description,
  empty,
  children,
}: {
  title: string;
  description?: string;
  empty: boolean;
  children: React.ReactElement;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </CardHeader>
      <CardContent>
        {empty ? (
          <EmptyState
            title="Nothing in this range"
            description="Widen the date range, or record some orders."
            className="py-10"
          />
        ) : (
          /*
            role="img" with one description, rather than a chart library's
            dozens of anonymous <svg> swatches and paths being read out one by
            one. Every figure drawn here is also available as text — in the
            cards above and the tables below — so nothing is lost by treating
            the drawing itself as a single image.
          */
          <div
            className="h-64 w-full"
            role="img"
            aria-label={description ? `${title}. ${description}` : title}
          >
            <ResponsiveContainer width="100%" height="100%">
              {children}
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const axis = { stroke: "var(--muted-foreground)", fontSize: 11 };

/**
 * Recharts colours legend text with its series colour, which makes the label
 * for a deliberately subtle series unreadable — "Order value routed" came out
 * near-white on white. The swatch keeps the series colour; the words do not.
 */
const legendLabel = (value: unknown) => (
  <span style={{ color: "var(--foreground)" }}>{String(value)}</span>
);

/**
 * Charts are handed a currency rather than a formatter: a function cannot be
 * passed from a server component to a client one, and formatting money is
 * pure anyway.
 *
 * Recharts widens payload values to string | number | array, so anything that
 * is not a number is shown as-is rather than crashing the tooltip.
 */
function moneyFormatter(currency: string, compact = false) {
  return (value: unknown) =>
    typeof value === "number"
      ? formatMoney(majorNumberToMinor(value, currency), currency, { compact })
      : String(value ?? "");
}

function tooltipStyle() {
  const foreground = { color: "var(--popover-foreground)" };
  return {
    contentStyle: {
      background: "var(--popover)",
      border: "1px solid var(--border)",
      borderRadius: "0.5rem",
      fontSize: "0.75rem",
      ...foreground,
    },
    // Recharts colours each row of the tooltip with its series colour, which
    // overrides the container's. A deliberately subtle series then reads as
    // near-invisible text on the tooltip — "Closed : 3" in a grey barely
    // above the popover background. The swatch carries the colour; the words
    // do not.
    itemStyle: foreground,
    labelStyle: foreground,
  };
}

export function MonthlyChart({
  points,
  currency,
}: {
  points: MonthlyPoint[];
  currency: string;
}) {
  return (
    <ChartCard
      title="Order value and commission by month"
      // Two axes on purpose: commission is a small percentage of order value,
      // so a shared scale would flatten it into the baseline.
      description="Separate scales — commission is a fraction of order value, and would otherwise be invisible."
      empty={points.every((point) => point.orderValue === 0)}
    >
      <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} {...axis} />
        <YAxis
          yAxisId="value"
          tickLine={false}
          axisLine={false}
          width={70}
          tickFormatter={moneyFormatter(currency, true)}
          {...axis}
        />
        <YAxis
          yAxisId="commission"
          orientation="right"
          tickLine={false}
          axisLine={false}
          width={70}
          tickFormatter={moneyFormatter(currency, true)}
          {...axis}
        />
        <Tooltip formatter={moneyFormatter(currency)} {...tooltipStyle()} />
        <Legend wrapperStyle={{ fontSize: "0.75rem" }} formatter={legendLabel} />
        <Bar
          yAxisId="value"
          dataKey="orderValue"
          name="Order value routed"
          fill="var(--chart-2)"
          radius={[3, 3, 0, 0]}
        />
        <Line
          yAxisId="commission"
          type="linear"
          dataKey="commission"
          name="Commission earned"
          stroke="var(--chart-5)"
          strokeWidth={2}
          dot={false}
        />
      </ComposedChart>
    </ChartCard>
  );
}

export function CashChart({
  points,
  currency,
}: {
  points: CashPoint[];
  currency: string;
}) {
  return (
    <ChartCard
      title="Cash received by month"
      description="By the date each payment arrived, not the date its order was placed."
      empty={points.every((point) => point.amount === 0)}
    >
      <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} {...axis} />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={70}
          tickFormatter={moneyFormatter(currency, true)}
          {...axis}
        />
        <Tooltip formatter={moneyFormatter(currency)} {...tooltipStyle()} />
        <Line
          type="linear"
          dataKey="amount"
          name="Cash received"
          stroke="var(--chart-3)"
          strokeWidth={2}
          dot={{ r: 2 }}
        />
      </LineChart>
    </ChartCard>
  );
}

export function RankedChart({
  title,
  description,
  points,
  currency,
}: {
  title: string;
  description?: string;
  points: RankedPoint[];
  currency: string;
}) {
  return (
    <ChartCard title={title} description={description} empty={points.length === 0}>
      <BarChart
        data={points}
        layout="vertical"
        margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
      >
        <CartesianGrid stroke="var(--border)" horizontal={false} />
        <XAxis
          type="number"
          tickLine={false}
          axisLine={false}
          tickFormatter={moneyFormatter(currency, true)}
          {...axis}
        />
        <YAxis
          type="category"
          dataKey="label"
          width={140}
          tickLine={false}
          axisLine={false}
          {...axis}
        />
        <Tooltip formatter={moneyFormatter(currency)} {...tooltipStyle()} />
        <Bar dataKey="commission" name="Commission" fill="var(--chart-2)" radius={[0, 3, 3, 0]} />
      </BarChart>
    </ChartCard>
  );
}

export function StatusDonut({ points }: { points: StatusPoint[] }) {
  return (
    <ChartCard
      title="Projects by status"
      description="Every order in the range, cancelled ones included."
      empty={points.length === 0}
    >
      <PieChart>
        <Pie
          data={points}
          dataKey="count"
          nameKey="label"
          innerRadius="55%"
          outerRadius="80%"
          paddingAngle={2}
        >
          {points.map((point, index) => (
            <Cell key={point.label} fill={SLICE_COLORS[index % SLICE_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip {...tooltipStyle()} />
        <Legend wrapperStyle={{ fontSize: "0.75rem" }} formatter={legendLabel} />
      </PieChart>
    </ChartCard>
  );
}
