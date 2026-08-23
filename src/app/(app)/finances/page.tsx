import type { Metadata } from "next";
import { BarChart3 } from "lucide-react";
import { FinancesFilters } from "./finances-filters";
import { CashChart, ExpensesChart, StatusDonut } from "./finances-charts";
import {
  LateDeliveriesTable,
  ReceivablesTable,
  UpcomingSamplingsTable,
} from "./finances-tables";
import { Passbook, type PassbookRow } from "./passbook";
import { AddExpenseDialog } from "./add-expense-dialog";
import { ExportButton } from "./export-button";
import { StatCard } from "./stat-card";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  cashByMonth,
  expensesByCategory,
  lateDeliveries,
  monthlyRetainer,
  overdueReceivables,
  passbook,
  summarise,
} from "@/lib/finances/aggregate";
import {
  getClientOptions,
  getCurrencyOptions,
  getFinances,
  parseFinanceRange,
  rangeToInputs,
} from "@/lib/finances/queries";
import { formatDateOnly, todayUtc, utcToDateOnly } from "@/lib/dates";
import {
  EXPENSE_CATEGORY_LABELS,
  LEDGER_KIND_LABELS,
  PROJECT_STATUS_LABELS,
  type ExpenseCategory,
} from "@/lib/enums";
import {
  DEFAULT_CURRENCY,
  formatMoney,
  minorToMajorNumber,
  minorToMajorString,
} from "@/lib/money";
import type { RawSearchParams } from "@/lib/list-params";

export const metadata: Metadata = { title: "Finances — Hide & Weave" };

/** "2026-03" -> "Mar 26", which fits on an axis. */
function monthLabel(month: string): string {
  const [year, index] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, index - 1, 1));
  return `${date.toLocaleString("en", { month: "short", timeZone: "UTC" })} ${String(year).slice(2)}`;
}

export default async function FinancesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const currencies = await getCurrencyOptions();
  const range = parseFinanceRange(params, currencies);
  const [data, clients] = await Promise.all([getFinances(range), getClientOptions()]);

  const today = todayUtc();
  const money = (minor: bigint) => formatMoney(minor, range.currency);
  const chartNumber = (minor: bigint) => minorToMajorNumber(minor, range.currency);

  const summary = summarise(data.projects, data.cashPayments, data.expenses, data.retainers);
  const retainer = monthlyRetainer(data.clients);
  const inputs = rangeToInputs(range);

  const categoryLabelOf = (category: string | null) =>
    category ? (EXPENSE_CATEGORY_LABELS[category as ExpenseCategory] ?? category) : null;

  // The passbook prefixes its ids so a receipt and an expense can never
  // collide; the suffix is what looks the underlying row back up for the edit
  // form that sits in its place.
  const expenseById = new Map(data.expenses.map((expense) => [expense.id, expense]));

  const passbookRows: PassbookRow[] = passbook(
    data.cashPayments,
    data.expenses,
    data.retainers,
  ).map((entry) => {
    // Only expenses are editable here. Commission belongs to an order and is
    // corrected on its page; a retainer row is derived from the schedule and
    // is changed by starting or stopping it on the client.
    const expense = entry.id.startsWith("expense-")
      ? expenseById.get(entry.id.slice("expense-".length))
      : undefined;

    return {
      id: entry.id,
      displayDate: formatDateOnly(entry.date),
      direction: entry.direction,
      kind: entry.kind,
      kindLabel: LEDGER_KIND_LABELS[entry.kind],
      description: entry.description,
      amountDisplay: money(entry.amount),
      balanceDisplay: money(entry.balance),
      balanceNegative: entry.balance < 0n,
      projectId: entry.projectId,
      orderId: entry.orderId,
      orderExists: entry.orderExists,
      categoryLabel: categoryLabelOf(entry.category),
      expense: expense
        ? {
            id: expense.id,
            incurredOn: utcToDateOnly(expense.incurredOn),
            displayDate: formatDateOnly(expense.incurredOn),
            description: expense.description,
            amountDisplay: money(expense.amount),
            amountInput: minorToMajorString(expense.amount, range.currency),
            category: expense.category ?? "",
            categoryLabel: categoryLabelOf(expense.category),
            notes: expense.notes,
            projectId: expense.projectId,
            clientId: expense.clientId ?? "",
            clientName: expense.clientName,
          }
        : null,
    };
  });

  const totalIn = summary.moneyIn;
  const isDefault = !params.from && !params.to && !params.currency;

  if (currencies.length === 0) {
    return (
      <>
        <PageHeader
          title="Finances"
          description="Every figure here is derived from your orders, payments and samplings."
          actions={<AddExpenseDialog currency={DEFAULT_CURRENCY} clients={clients} />}
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
        title="Finances"
        description="Orders, payments and samplings drive every figure here. Expenses and retainers are the two things you record on this page."
        actions={
          <>
            <AddExpenseDialog currency={range.currency} clients={clients} />
            <ExportButton />
          </>
        }
      />

      <FinancesFilters
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
            label="Money in"
            value={money(summary.moneyIn)}
            hint="Commission and retainer fees received in this range"
            tone="positive"
          />
          <StatCard
            label="Expenses"
            value={money(summary.expenses)}
            hint="What you spent in this range, on orders and overheads"
          />
          {/* Commission less expenses: the figure the two above net down to. */}
          <StatCard
            label="Net earned"
            value={money(summary.netEarned)}
            hint="Commission earned, plus retainer fees received, less expenses"
            tone={summary.netEarned < 0n ? "warning" : "positive"}
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
          {/* Two different things, deliberately on one card: the fees actually
              logged in this range, and what the clients are charged monthly.
              Only the first is income. */}
          <StatCard
            label="Retainers received"
            value={money(summary.retainerReceived)}
            hint={`${money(retainer)} a month across active clients`}
            tone="positive"
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

          <ExpensesChart
            points={expensesByCategory(data.expenses).map((row) => ({
              label: row.key
                ? (EXPENSE_CATEGORY_LABELS[row.key as ExpenseCategory] ?? row.key)
                : "Uncategorised",
              amount: chartNumber(row.amount),
            }))}
            currency={range.currency}
          />
        </div>

        <Passbook
          rows={passbookRows}
          currency={range.currency}
          clients={clients}
          totalInDisplay={money(totalIn)}
          totalOutDisplay={money(summary.expenses)}
          netDisplay={money(summary.netCash)}
          netNegative={summary.netCash < 0n}
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
