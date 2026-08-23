"use server";

import { commissionOf, outstandingOf, passbook, receivedOn } from "@/lib/finances/aggregate";
import { getFinances, parseFinanceRange, getCurrencyOptions } from "@/lib/finances/queries";
import { rowsToCsv } from "@/lib/csv/mapping";
import { utcToDateOnly } from "@/lib/dates";
import { minorToMajorString } from "@/lib/money";
import {
  EXPENSE_CATEGORY_LABELS,
  LEDGER_KIND_LABELS,
  PROJECT_STATUS_LABELS,
  type ExpenseCategory,
  type ProjectStatus,
} from "@/lib/enums";

/**
 * The orders behind the dashboard, one row each.
 *
 * Deliberately the underlying records rather than the summarised cards: a
 * total you cannot check is worth less than the rows behind it. Money is
 * written in major units without grouping, so a spreadsheet reads it as a
 * number rather than as text.
 *
 * This is a view of the *business*, not of the money that moved — `Received`
 * here counts every payment ever made against an order and is capped at the
 * commission owed, so it deliberately does not tie to the passbook. Use the
 * ledger export for that.
 */
export async function exportFinancesCsv(
  searchParams: Record<string, string>,
): Promise<{ filename: string; csv: string }> {
  const currencies = await getCurrencyOptions();
  const range = parseFinanceRange(searchParams, currencies);
  const { projects, expenses } = await getFinances(range);

  // Expenses belong to an order, so they export against it. General overheads
  // have no order to sit beside and are exported as their own rows below.
  const expensesByProject = new Map<string, bigint>();
  for (const expense of expenses) {
    if (!expense.projectId) continue;
    expensesByProject.set(
      expense.projectId,
      (expensesByProject.get(expense.projectId) ?? 0n) + expense.amount,
    );
  }

  const headers = [
    "Order ID",
    "Client",
    "Product",
    "Status",
    "Order date",
    "Expected delivery",
    "Actual delivery",
    "Currency",
    "Order value",
    "Commission %",
    "Commission",
    "Received",
    "Outstanding",
    "Expenses",
    "Net",
  ];

  const rows = projects
    .slice()
    .sort((a, b) => a.orderDate.getTime() - b.orderDate.getTime())
    .map((project) => {
      const commission = commissionOf(project);
      const outstanding = outstandingOf(project);
      const spent = expensesByProject.get(project.id) ?? 0n;

      return {
        "Order ID": project.orderId,
        Client: project.clientName,
        Product: project.product,
        Status: PROJECT_STATUS_LABELS[project.status as ProjectStatus] ?? project.status,
        "Order date": utcToDateOnly(project.orderDate),
        "Expected delivery": project.expectedDelivery
          ? utcToDateOnly(project.expectedDelivery)
          : "",
        "Actual delivery": project.actualDelivery ? utcToDateOnly(project.actualDelivery) : "",
        Currency: range.currency,
        "Order value": minorToMajorString(project.orderValue, range.currency),
        "Commission %": String(project.commissionPercentage),
        Commission: minorToMajorString(commission, range.currency),
        // Every payment received against this order. Not capped at the
        // commission: capping reported an overpaid order as having received
        // less than the client actually sent.
        Received: minorToMajorString(receivedOn(project), range.currency),
        Outstanding: minorToMajorString(outstanding, range.currency),
        Expenses: minorToMajorString(spent, range.currency),
        Net: minorToMajorString(commission - spent, range.currency),
      };
    });

  const from = utcToDateOnly(range.from);
  const to = utcToDateOnly(range.to);

  return {
    filename: `finances-${range.currency}-${from}-to-${to}.csv`,
    csv: rowsToCsv(headers, rows),
  };
}

/**
 * The passbook, row for row, so a spreadsheet reconciles with what the page
 * shows.
 *
 * Every entry in the range with a running balance beside it, which is what
 * makes it checkable: the last balance in the file is the closing balance on
 * the dashboard, and the In and Out columns add up to the totals under it.
 *
 * Deleted orders and clients are included, named but with no id to follow,
 * because the ledger records money that moved regardless of what became of
 * what it moved against.
 */
export async function exportLedgerCsv(
  searchParams: Record<string, string>,
): Promise<{ filename: string; csv: string }> {
  const currencies = await getCurrencyOptions();
  const range = parseFinanceRange(searchParams, currencies);
  const { cashPayments, expenses, retainers } = await getFinances(range);
  const entries = passbook(cashPayments, expenses, retainers);

  const headers = [
    "Date",
    "Type",
    "Detail",
    "Client",
    "Order ID",
    "Category",
    "Currency",
    "In",
    "Out",
    "Balance",
  ];

  const rows = entries.map((entry) => ({
    Date: utcToDateOnly(entry.date),
    Type: LEDGER_KIND_LABELS[entry.kind],
    Detail: entry.description,
    Client: entry.clientName ?? "",
    // Named even when the order has been deleted — the money still moved.
    "Order ID": entry.orderId ?? "",
    Category: entry.category
      ? (EXPENSE_CATEGORY_LABELS[entry.category as ExpenseCategory] ?? entry.category)
      : "",
    Currency: range.currency,
    In: entry.direction === "IN" ? minorToMajorString(entry.amount, range.currency) : "",
    Out: entry.direction === "OUT" ? minorToMajorString(entry.amount, range.currency) : "",
    Balance: minorToMajorString(entry.balance, range.currency),
  }));

  const from = utcToDateOnly(range.from);
  const to = utcToDateOnly(range.to);

  return {
    filename: `ledger-${range.currency}-${from}-to-${to}.csv`,
    csv: rowsToCsv(headers, rows),
  };
}
