import { daysBetween, monthKey } from "@/lib/dates";
import { SETTLED_PROJECT_STATUSES, type ProjectStatus } from "@/lib/enums";
import { computeCommission, percentOf, sumMinor } from "@/lib/money";

/**
 * Every figure on the Economics dashboard, as pure functions over plain rows.
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

export type EconomicsPayment = { amount: bigint; paidOn: Date };

export type EconomicsProject = {
  id: string;
  clientId: string;
  clientName: string;
  product: string;
  orderId: string;
  orderValue: bigint;
  commissionPercentage: number;
  status: ProjectStatus;
  orderDate: Date;
  expectedDelivery: Date | null;
  actualDelivery: Date | null;
  payments: EconomicsPayment[];
};

/** A cancelled order routed no goods and earned nothing. */
const counts = (project: { status: ProjectStatus }) => project.status !== "CANCELLED";

export function commissionOf(project: {
  orderValue: bigint;
  commissionPercentage: number;
}): bigint {
  return computeCommission(project.orderValue, project.commissionPercentage);
}

function paidOn(project: EconomicsProject): bigint {
  return sumMinor(project.payments.map((payment) => payment.amount));
}

/**
 * What is still owed on one project: commission earned less everything
 * received against it. Never negative — an overpayment is not a debt.
 */
export function outstandingOf(project: EconomicsProject): bigint {
  const difference = commissionOf(project) - paidOn(project);
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
  /** Payments received, by when they were paid. */
  cashReceived: bigint;
  /** Commission earned but not yet received. */
  outstanding: bigint;
  /**
   * The part of `outstanding` on orders that have not been delivered — the
   * goods have not landed, so the commission is not firmly owed yet.
   */
  atRisk: bigint;
  activeProjects: number;
  byStatus: StatusTotal[];
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
  projects: EconomicsProject[],
  cashPayments: EconomicsPayment[],
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

  return {
    orderValue,
    commission,
    averageCommissionPercentage: percentOf(commission, orderValue),
    cashReceived: sumMinor(cashPayments.map((payment) => payment.amount)),
    outstanding: sumMinor(live.map(outstandingOf)),
    atRisk: sumMinor(live.filter((p) => !settled.has(p.status)).map(outstandingOf)),
    activeProjects: live.length,
    byStatus: [...byStatus.values()].sort((a, b) => b.orderValue > a.orderValue ? 1 : -1),
  };
}

/**
 * Retainers are a monthly figure per client, not a transaction — there are no
 * payment records for them. This is what the active clients are billed each
 * month, and it is labelled as such rather than counted as cash received.
 */
export function monthlyRetainer(
  clients: Array<{ fixedMonthly: bigint | null; status: string }>,
): bigint {
  return sumMinor(
    clients
      .filter((client) => client.status === "ACTIVE" && client.fixedMonthly !== null)
      .map((client) => client.fixedMonthly as bigint),
  );
}

// ----------------------------------------------------------------- Charts

export type MonthPoint = { month: string; orderValue: bigint; commission: bigint };

/**
 * One point per calendar month between `from` and `to`, including months with
 * nothing in them — a gap in a time series should read as a quiet month, not
 * as a missing one.
 */
export function monthlyTotals(
  projects: EconomicsProject[],
  from: Date,
  to: Date,
): MonthPoint[] {
  const points = new Map<string, MonthPoint>();
  for (const month of monthsBetween(from, to)) {
    points.set(month, { month, orderValue: 0n, commission: 0n });
  }

  for (const project of projects.filter(counts)) {
    const point = points.get(monthKey(project.orderDate));
    if (!point) continue;
    point.orderValue += project.orderValue;
    point.commission += commissionOf(project);
  }

  return [...points.values()];
}

export function cashByMonth(
  payments: EconomicsPayment[],
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

export type Ranked = { key: string; label: string; commission: bigint; orderValue: bigint };

/** Commission grouped by something, biggest first, capped at `limit`. */
function rankBy(
  projects: EconomicsProject[],
  keyOf: (project: EconomicsProject) => { key: string; label: string },
  limit: number,
): Ranked[] {
  const groups = new Map<string, Ranked>();

  for (const project of projects.filter(counts)) {
    const { key, label } = keyOf(project);
    const entry = groups.get(key) ?? { key, label, commission: 0n, orderValue: 0n };
    entry.commission += commissionOf(project);
    entry.orderValue += project.orderValue;
    groups.set(key, entry);
  }

  return [...groups.values()]
    .sort((a, b) => (b.commission === a.commission ? 0 : b.commission > a.commission ? 1 : -1))
    .slice(0, limit);
}

export function commissionByClient(projects: EconomicsProject[], limit = 10): Ranked[] {
  return rankBy(projects, (p) => ({ key: p.clientId, label: p.clientName }), limit);
}

export function commissionByProduct(projects: EconomicsProject[], limit = 10): Ranked[] {
  // Products are free text, so they group by their own name, case-folded.
  return rankBy(
    projects,
    (p) => ({ key: p.product.trim().toLowerCase(), label: p.product.trim() }),
    limit,
  );
}

// ----------------------------------------------------------------- Tables

export type ClientRow = {
  clientId: string;
  clientName: string;
  orders: number;
  orderValue: bigint;
  commission: bigint;
  /** Weighted by order value, like the headline figure. */
  averagePercentage: number;
  outstanding: bigint;
};

export function topClients(projects: EconomicsProject[], limit = 10): ClientRow[] {
  const rows = new Map<string, ClientRow>();

  for (const project of projects.filter(counts)) {
    const row = rows.get(project.clientId) ?? {
      clientId: project.clientId,
      clientName: project.clientName,
      orders: 0,
      orderValue: 0n,
      commission: 0n,
      averagePercentage: 0,
      outstanding: 0n,
    };
    row.orders += 1;
    row.orderValue += project.orderValue;
    row.commission += commissionOf(project);
    row.outstanding += outstandingOf(project);
    rows.set(project.clientId, row);
  }

  return [...rows.values()]
    .map((row) => ({ ...row, averagePercentage: percentOf(row.commission, row.orderValue) }))
    .sort((a, b) => (b.commission === a.commission ? 0 : b.commission > a.commission ? 1 : -1))
    .slice(0, limit);
}

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
  projects: EconomicsProject[],
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
      paid: paidOn(project),
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
export function lateDeliveries(projects: EconomicsProject[], today: Date): LateRow[] {
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
