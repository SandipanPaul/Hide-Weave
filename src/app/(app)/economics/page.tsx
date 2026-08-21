import type { Metadata } from "next";
import { BarChart3 } from "lucide-react";
import { EconomicsFilters } from "./economics-filters";
import {
  CashChart,
  MonthlyChart,
  RankedChart,
  StatusDonut,
} from "./economics-charts";
import {
  LateDeliveriesTable,
  ReceivablesTable,
  TopClientsTable,
  UpcomingSamplingsTable,
} from "./economics-tables";
import { ExportButton } from "./export-button";
import { StatCard } from "./stat-card";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  cashByMonth,
  commissionByClient,
  commissionByProduct,
  lateDeliveries,
  monthlyRetainer,
  monthlyTotals,
  overdueReceivables,
  summarise,
  topClients,
} from "@/lib/economics/aggregate";
import {
  getCurrencyOptions,
  getEconomics,
  parseEconomicsRange,
  rangeToInputs,
} from "@/lib/economics/queries";
import { formatDateOnly, todayUtc } from "@/lib/dates";
import { PROJECT_STATUS_LABELS } from "@/lib/enums";
import { formatMoney, minorToMajorNumber } from "@/lib/money";
import type { RawSearchParams } from "@/lib/list-params";

export const metadata: Metadata = { title: "Economics — Hide & Weave" };

/** "2026-03" -> "Mar 26", which fits on an axis. */
function monthLabel(month: string): string {
  const [year, index] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, index - 1, 1));
  return `${date.toLocaleString("en", { month: "short", timeZone: "UTC" })} ${String(year).slice(2)}`;
}

export default async function EconomicsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const currencies = await getCurrencyOptions();
  const range = parseEconomicsRange(params, currencies);
  const data = await getEconomics(range);

  const today = todayUtc();
  const money = (minor: bigint) => formatMoney(minor, range.currency);
  const chartNumber = (minor: bigint) => minorToMajorNumber(minor, range.currency);

  const summary = summarise(data.projects, data.cashPayments);
  const retainer = monthlyRetainer(data.clients);
  const inputs = rangeToInputs(range);
  const isDefault = !params.from && !params.to && !params.currency;

  if (currencies.length === 0) {
    return (
      <>
        <PageHeader
          title="Economics"
          description="Every figure here is derived from your orders, payments and samplings."
        />
        <EmptyState
          icon={BarChart3}
          title="Nothing to report yet"
          description="Record some orders and the commission they earn, and this page will fill itself in."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Economics"
        description="Every figure here is derived from your orders, payments and samplings — nothing on this page is typed in."
        actions={<ExportButton />}
      />

      <EconomicsFilters
        from={inputs.from}
        to={inputs.to}
        currency={range.currency}
        currencies={currencies}
        isDefault={isDefault}
      />

      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Commission first and largest: it is the only figure on this page
              that is the agent's income. */}
          <StatCard
            label="Commission earned"
            value={money(summary.commission)}
            hint={`${summary.averageCommissionPercentage.toFixed(2)}% of value routed, weighted by order size`}
            emphasis
          />
          <StatCard
            label="Order value routed"
            value={money(summary.orderValue)}
            hint="Goods moved through you — not income"
          />
          <StatCard
            label="Cash received"
            value={money(summary.cashReceived)}
            hint="Payments that arrived in this range"
            tone="positive"
          />
          <StatCard
            label="Outstanding"
            value={money(summary.outstanding)}
            hint="Commission earned but not yet received"
          />
          <StatCard
            label="Commission at risk"
            value={money(summary.atRisk)}
            hint="Unpaid commission on orders not yet delivered"
            tone={summary.atRisk > 0n ? "warning" : undefined}
          />
          <StatCard
            label="Monthly retainer"
            value={money(retainer)}
            hint="Billed monthly across active clients, separate from commission"
          />
          <StatCard
            label="Active projects"
            value={String(summary.activeProjects)}
            hint="Orders in this range, excluding cancelled"
          />
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                By status
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-1.5">
              {summary.byStatus.length === 0 ? (
                <span className="text-sm text-muted-foreground">Nothing in this range</span>
              ) : (
                summary.byStatus.map((entry) => (
                  <Badge key={entry.status} variant="outline" className="font-normal">
                    {PROJECT_STATUS_LABELS[entry.status] ?? entry.status}
                    <span className="ml-1 tabular-nums text-muted-foreground">{entry.count}</span>
                  </Badge>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <MonthlyChart
          points={monthlyTotals(data.projects, range.from, range.to).map((point) => ({
            month: point.month,
            label: monthLabel(point.month),
            orderValue: chartNumber(point.orderValue),
            commission: chartNumber(point.commission),
          }))}
          currency={range.currency}
        />

        <div className="grid gap-6 lg:grid-cols-2">
          <CashChart
            points={cashByMonth(data.cashPayments, range.from, range.to).map((point) => ({
              month: point.month,
              label: monthLabel(point.month),
              amount: chartNumber(point.amount),
            }))}
            currency={range.currency}
          />

          <StatusDonut
            points={summary.byStatus.map((entry) => ({
              label: PROJECT_STATUS_LABELS[entry.status] ?? entry.status,
              count: entry.count,
            }))}
          />

          <RankedChart
            title="Commission by client"
            description="Top 10 in this range."
            points={commissionByClient(data.projects).map((row) => ({
              label: row.label,
              commission: chartNumber(row.commission),
            }))}
            currency={range.currency}
          />

          <RankedChart
            title="Commission by product"
            description="Top 10 in this range."
            points={commissionByProduct(data.projects).map((row) => ({
              label: row.label,
              commission: chartNumber(row.commission),
            }))}
            currency={range.currency}
          />
        </div>

        <TopClientsTable
          rows={topClients(data.projects).map((row) => ({
            clientId: row.clientId,
            clientName: row.clientName,
            orders: row.orders,
            orderValue: money(row.orderValue),
            commission: money(row.commission),
            averagePercentage: `${row.averagePercentage.toFixed(2)}%`,
          }))}
        />

        <div className="grid gap-6 xl:grid-cols-2">
          <ReceivablesTable
            rows={overdueReceivables(data.projects, today).map((row) => ({
              id: row.id,
              orderId: row.orderId,
              clientName: row.clientName,
              product: row.product,
              paid: money(row.paid),
              outstanding: money(row.outstanding),
              daysOutstanding: row.daysOutstanding,
            }))}
          />

          <LateDeliveriesTable
            rows={lateDeliveries(data.projects, today).map((row) => ({
              id: row.id,
              orderId: row.orderId,
              clientName: row.clientName,
              product: row.product,
              expectedDelivery: formatDateOnly(row.expectedDelivery),
              daysLate: row.daysLate,
              status: row.status,
            }))}
          />
        </div>

        <UpcomingSamplingsTable
          rows={data.samplings.map((sampling) => ({
            id: sampling.id,
            clientId: sampling.clientId,
            clientName: sampling.clientName,
            date: formatDateOnly(sampling.scheduledDate),
            product: sampling.product,
          }))}
        />
      </div>
    </>
  );
}
