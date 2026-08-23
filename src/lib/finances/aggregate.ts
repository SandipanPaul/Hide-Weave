import { daysBetween, monthKey } from "@/lib/dates";
import { SETTLED_PROJECT_STATUSES, type LedgerKind, type ProjectStatus } from "@/lib/enums";
import { computeCommission, percentOf, sumMinor } from "@/lib/money";

/**
 * Every figure on the Finances dashboard, as pure functions over plain rows.
 *
 * No Prisma, no React, no dates read from the clock — the caller passes
 * `today` in. That is what makes these testable, and the dashboard is only a
 * rendering of what they return.
 *
 * Two rules run through all of it:
 *
 *   * **Order value is not income.** It is the value of goods routed through
 *     the agent. Commission is the revenue. They are never added together and
 *     order value is never labelled as earnings.
 *   * **One currency at a time.** These functions take rows already filtered
 *     to a single currency, because this app never converts between them.
 */

export type FinancePayment = { amount: bigint; paidOn: Date };

/** A retainer fee received, logged by hand on the client's page. */
export type FinanceRetainer = {
  id: string;
  amount: bigint;
  paidOn: Date;
  clientId: string;
  clientName: string;
};

/** A commission receipt as the passbook sees it. Always names an order. */
export type FinanceReceipt = FinancePayment & {
  id: string;
  projectId: string;
  orderId: string;
  clientName: string | null;
  /** False once the order has been deleted — the row stays, the link goes. */
  orderExists: boolean;
};

export type FinanceExpense = {
  id: string;
  amount: bigint;
  incurredOn: Date;
  description: string;
  category: string | null;
  notes: string | null;
  /** The order it was spent on, if any. General overheads have none. */
  projectId: string | null;
  orderId: string | null;
  orderExists: boolean;
  /** Who it was spent for, if anyone — independent of the order. */
  clientId: string | null;
  clientName: string | null;
};

export type FinanceProject = {
  id: string;
  clientId: string;
  clientName: string;
  product: string;
  orderId: string;
  /** The client's own reference, carried into the orders export. */
  clientReference: string | null;
  orderValue: bigint;
  commissionPercentage: number;
  status: ProjectStatus;
  orderDate: Date;
  expectedDelivery: Date | null;
  actualDelivery: Date | null;
  payments: FinancePayment[];
};

/** A cancelled order routed no goods and earned nothing. */
const counts = (project: { status: ProjectStatus }) => project.status !== "CANCELLED";

export function commissionOf(project: {
  orderValue: bigint;
  commissionPercentage: number;
}): bigint {
  return computeCommission(project.orderValue, project.commissionPercentage);
}

/** Everything received against one order, uncapped — the cash, not a balance. */
export function receivedOn(project: FinanceProject): bigint {
  return sumMinor(project.payments.map((payment) => payment.amount));
}

/**
 * What is still owed on one project: commission earned less everything
 * received against it. Never negative — an overpayment is not a debt.
 */
export function outstandingOf(project: FinanceProject): bigint {
  const difference = commissionOf(project) - receivedOn(project);
  return difference > 0n ? difference : 0n;
}

// ------------------------------------------------------------------ Cards

export type StatusTotal = { status: ProjectStatus; count: number; orderValue: bigint };

export type Summary = {
  /** Goods routed through the agent. Not income. */
  orderValue: bigint;
  /** The headline: what the agent earned. */
  commission: bigint;
  /** Weighted by order value, so a large order counts for more than a small one. */
  averageCommissionPercentage: number;
  /** Everything received: commission plus retainer fees. */
  moneyIn: bigint;
  /** The commission part of `moneyIn` — payments that actually arrived. */
  commissionReceived: bigint;
  /** Retainer fees received in this range. Logged by hand, never assumed. */
  retainerReceived: bigint;
  /** Commission earned but not yet received. */
  outstanding: bigint;
  /**
   * The part of `outstanding` on orders that have not been delivered — the
   * goods have not landed, so the commission is not firmly owed yet.
   */
  atRisk: bigint;
  activeProjects: number;
  byStatus: StatusTotal[];
  /** Money the agent spent in this range, on orders and on overheads alike. */
  expenses: bigint;
  /**
   * Commission earned plus retainer fees received, less expenses — what the
   * period was worth. Negative when the costs outran the earnings, which is
   * worth seeing.
   */
  netEarned: bigint;
  /** Cash that arrived less cash that went out: the period on a cash basis. */
  netCash: bigint;
};

/**
 * `projects` are the orders whose `orderDate` falls in the range.
 * `cashPayments` are the payments whose `paidOn` falls in the range, which is
 * a different set: a payment in March against a January order is March's cash.
 *
 * Outstanding, by contrast, counts *every* payment ever made against these
 * orders — it is a balance as of now, not an in-period flow. Limiting it to
 * the range would make a long-settled order look unpaid.
 */
export function summarise(
  projects: FinanceProject[],
  cashPayments: FinanceReceipt[],
  expenseRows: FinanceExpense[] = [],
  retainers: readonly FinanceRetainer[] = [],
): Summary {
  const live = projects.filter(counts);

  const orderValue = sumMinor(live.map((project) => project.orderValue));
  const commission = sumMinor(live.map(commissionOf));

  const byStatus = new Map<ProjectStatus, StatusTotal>();
  for (const project of projects) {
    const entry = byStatus.get(project.status) ?? {
      status: project.status,
      count: 0,
      orderValue: 0n,
    };
    entry.count += 1;
    entry.orderValue += project.orderValue;
    byStatus.set(project.status, entry);
  }

  const settled = new Set<string>(SETTLED_PROJECT_STATUSES);
  const commissionReceived = sumMinor(cashPayments.map((payment) => payment.amount));
  const retainerReceived = sumMinor(retainers.map((retainer) => retainer.amount));
  const moneyIn = commissionReceived + retainerReceived;
  const expenses = sumMinor(expenseRows.map((expense) => expense.amount));

  return {
    orderValue,
    commission,
    averageCommissionPercentage: percentOf(commission, orderValue),
    moneyIn,
    commissionReceived,
    retainerReceived,
    outstanding: sumMinor(live.map(outstandingOf)),
    atRisk: sumMinor(live.filter((p) => !settled.has(p.status)).map(outstandingOf)),
    activeProjects: live.length,
    byStatus: [...byStatus.values()].sort((a, b) => b.orderValue > a.orderValue ? 1 : -1),
    expenses,
    // Commission earned in the range, plus retainer fees received over it,
    // less what was spent. The closest thing this app has to a P&L.
    netEarned: commission + retainerReceived - expenses,
    netCash: moneyIn - expenses,
  };
}

/**
 * What the active clients are charged per month, added up.
 *
 * The rate, not the receipts — context for the figure beside it, never counted
 * as income. Inactive clients are excluded: they are not being billed.
 */
export function monthlyRetainer(
  clients: ReadonlyArray<{ fixedMonthly: bigint | null; status: string }>,
): bigint {
  return sumMinor(
    clients
      .filter((client) => client.status === "ACTIVE" && client.fixedMonthly !== null)
      .map((client) => client.fixedMonthly as bigint),
  );
}

// ----------------------------------------------------------------- Charts

export function cashByMonth(
  payments: FinancePayment[],
  from: Date,
  to: Date,
): Array<{ month: string; amount: bigint }> {
  const points = new Map<string, { month: string; amount: bigint }>();
  for (const month of monthsBetween(from, to)) points.set(month, { month, amount: 0n });

  for (const payment of payments) {
    const point = points.get(monthKey(payment.paidOn));
    if (point) point.amount += payment.amount;
  }

  return [...points.values()];
}

/** Every "YYYY-MM" from `from` to `to` inclusive. */
export function monthsBetween(from: Date, to: Date): string[] {
  const months: string[] = [];
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  const last = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));

  while (cursor <= last) {
    months.push(monthKey(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}

// -------------------------------------------------------------- Passbook

export type PassbookEntry = {
  id: string;
  date: Date;
  /** "IN" is money received, "OUT" is money spent. */
  direction: "IN" | "OUT";
  /** What kind of movement this was, for the label beside it. */
  kind: LedgerKind;
  description: string;
  /** Always positive — `direction` carries the sign. */
  amount: bigint;
  /** Cumulative in-less-out up to and including this entry. */
  balance: bigint;
  /** The order behind the entry, when there is one. */
  projectId: string | null;
  orderId: string | null;
  /** Whether that order still exists, and so whether it can be linked to. */
  orderExists: boolean;
  /** Who the entry involved, when it involved anyone. */
  clientName: string | null;
  category: string | null;
};

/**
 * Every entry in the range as one running account: money in — commission and
 * retainer fees received — and expenses out, oldest first, with the balance
 * after each.
 *
 * Every row is money that actually moved. Commission *earned* on an order that
 * has not paid is not an entry, and neither is a retainer nobody has sent: both
 * stay on the cards above. That is what makes the closing balance mean
 * something.
 */
export function passbook(
  receipts: FinanceReceipt[],
  expenses: FinanceExpense[],
  retainers: readonly FinanceRetainer[] = [],
): PassbookEntry[] {
  const entries: Array<Omit<PassbookEntry, "balance">> = [
    ...receipts.map((receipt) => ({
      id: `payment-${receipt.id}`,
      date: receipt.paidOn,
      direction: "IN" as const,
      kind: "COMMISSION" as const,
      description: `Commission from ${receipt.clientName ?? "a client"}`,
      amount: receipt.amount,
      projectId: receipt.projectId as string | null,
      orderId: receipt.orderId as string | null,
      orderExists: receipt.orderExists,
      clientName: receipt.clientName,
      category: null,
    })),

    ...retainers.map((retainer) => ({
      id: `retainer-${retainer.id}`,
      date: retainer.paidOn,
      direction: "IN" as const,
      kind: "RETAINER" as const,
      description: `Retainer — ${retainer.clientName}`,
      amount: retainer.amount,
      projectId: null,
      orderId: null,
      orderExists: false,
      clientName: retainer.clientName,
      category: null,
    })),
    ...expenses.map((expense) => ({
      id: `expense-${expense.id}`,
      date: expense.incurredOn,
      direction: "OUT" as const,
      kind: "EXPENSE" as const,
      // Who a spend was for is part of what it was, so it is said here rather
      // than left to a column an order-shaped table has no room for.
      description: expense.clientName
        ? `${expense.description} — ${expense.clientName}`
        : expense.description,
      amount: expense.amount,
      projectId: expense.projectId,
      orderId: expense.orderId,
      orderExists: expense.orderExists,
      clientName: expense.clientName,
      category: expense.category,
    })),
  ];

  // Two things on the same day have no true order, so the tie is broken by id
  // to keep the sequence — and so the running balance — stable across renders.
  entries.sort(
    (a, b) => a.date.getTime() - b.date.getTime() || a.id.localeCompare(b.id),
  );

  let balance = 0n;
  return entries.map((entry) => {
    balance += entry.direction === "IN" ? entry.amount : -entry.amount;
    return { ...entry, balance };
  });
}

// -------------------------------------------------------------- Expenses

export type CategoryTotal = {
  /** The stored category, or "" for a spend nobody filed. */
  key: string;
  amount: bigint;
  count: number;
};

/**
 * Expenses grouped by category, biggest first.
 *
 * Uncategorised spends group under their own empty key rather than being
 * dropped: money left out of a breakdown is money the breakdown lies about.
 */
export function expensesByCategory(expenses: FinanceExpense[]): CategoryTotal[] {
  const groups = new Map<string, CategoryTotal>();

  for (const expense of expenses) {
    const key = expense.category ?? "";
    const entry = groups.get(key) ?? { key, amount: 0n, count: 0 };
    entry.amount += expense.amount;
    entry.count += 1;
    groups.set(key, entry);
  }

  return [...groups.values()].sort((a, b) =>
    b.amount === a.amount ? 0 : b.amount > a.amount ? 1 : -1,
  );
}

// ----------------------------------------------------------------- Tables

export type ReceivableRow = {
  id: string;
  orderId: string;
  clientName: string;
  product: string;
  commission: bigint;
  paid: bigint;
  outstanding: bigint;
  /** Days since the goods were delivered — how long the money has been owed. */
  daysOutstanding: number;
};

/**
 * Delivered orders that still owe commission, longest-waiting first.
 *
 * Only delivered and closed orders appear: before the goods land, the
 * commission is not overdue, it is simply not due yet.
 */
export function overdueReceivables(
  projects: FinanceProject[],
  today: Date,
): ReceivableRow[] {
  const settled = new Set<string>(SETTLED_PROJECT_STATUSES);

  return projects
    .filter((project) => counts(project) && settled.has(project.status))
    .map((project) => ({
      id: project.id,
      orderId: project.orderId,
      clientName: project.clientName,
      product: project.product,
      commission: commissionOf(project),
      paid: receivedOn(project),
      outstanding: outstandingOf(project),
      // Delivered orders usually carry a delivery date; fall back to the order
      // date so a missing one still reports an honest age.
      daysOutstanding: daysBetween(project.actualDelivery ?? project.orderDate, today),
    }))
    .filter((row) => row.outstanding > 0n)
    .sort((a, b) => b.daysOutstanding - a.daysOutstanding);
}

export type LateRow = {
  id: string;
  orderId: string;
  clientName: string;
  product: string;
  expectedDelivery: Date;
  daysLate: number;
  status: ProjectStatus;
};

/** Orders past their expected delivery date that have not been delivered. */
export function lateDeliveries(projects: FinanceProject[], today: Date): LateRow[] {
  const settled = new Set<string>(SETTLED_PROJECT_STATUSES);

  return projects
    .filter(
      (project) =>
        counts(project) &&
        !settled.has(project.status) &&
        project.actualDelivery === null &&
        project.expectedDelivery !== null &&
        project.expectedDelivery < today,
    )
    .map((project) => ({
      id: project.id,
      orderId: project.orderId,
      clientName: project.clientName,
      product: project.product,
      expectedDelivery: project.expectedDelivery as Date,
      daysLate: daysBetween(project.expectedDelivery as Date, today),
      status: project.status,
    }))
    .sort((a, b) => b.daysLate - a.daysLate);
}
