import { notDeleted, prisma } from "@/lib/db";
import { addDaysUtc, addMonthsUtc, dateOnlyToUtc, todayUtc, utcToDateOnly } from "@/lib/dates";
import { DEFAULT_CURRENCY } from "@/lib/money";
import type { ProjectStatus } from "@/lib/enums";
import type {
  FinanceExpense,
  FinanceReceipt,
  FinanceProject,
  FinanceRetainer,
} from "./aggregate";

/**
 * Reads for the Finances dashboard.
 *
 * Everything is derived from Projects, Payments, Clients and Samplings — there
 * is no stored figure anywhere on that page. Rows come back filtered to one
 * currency, because this app never converts between them.
 */

export type FinanceRange = { from: Date; to: Date; currency: string };

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Currencies in use, busiest first, so the default picks the one with the most
 * orders behind it.
 *
 * Orders are not the only thing denominated: a client billed a retainer in a
 * currency nothing has been ordered in still has money moving through it. If
 * this listed project currencies alone, that client's retainer could be
 * recorded and then never shown, because the filter it needs would not exist.
 * Such a currency is offered with a project count of zero, which sorts it
 * below the real trading currencies without hiding it.
 */
export async function getCurrencyOptions(): Promise<Array<{ currency: string; projects: number }>> {
  const [projectGroups, retainerClients, retainerReceiptGroups] = await Promise.all([
    prisma.project.groupBy({
      by: ["currency"],
      where: { ...notDeleted, status: { not: "CANCELLED" } },
      _count: { _all: true },
    }),
    // The rate a client is billed, whether or not anything has arrived yet.
    prisma.client.groupBy({
      by: ["currency"],
      where: { ...notDeleted, fixedMonthly: { not: null } },
    }),
    // And any fee already received, in case the rate was later cleared.
    prisma.retainerReceipt.groupBy({
      by: ["currency"],
      where: notDeleted,
    }),
  ]);

  const counts = new Map<string, number>();
  for (const group of projectGroups) counts.set(group.currency, group._count._all);
  for (const group of [...retainerClients, ...retainerReceiptGroups]) {
    if (!counts.has(group.currency)) counts.set(group.currency, 0);
  }

  return [...counts.entries()]
    .map(([currency, projects]) => ({ currency, projects }))
    .sort((a, b) => b.projects - a.projects || a.currency.localeCompare(b.currency));
}

/**
 * The range and currency the dashboard is showing.
 *
 * Defaults to the last 12 months — this month plus the 11 before it — and to
 * whichever currency has the most orders, which is the one the user most
 * likely wants to see first. A hand-edited URL degrades to those defaults
 * rather than erroring.
 */
export function parseFinanceRange(
  searchParams: Record<string, string | string[] | undefined>,
  currencies: Array<{ currency: string }>,
  now = todayUtc(),
): FinanceRange {
  const first = (value: string | string[] | undefined) =>
    (Array.isArray(value) ? value[0] : value) ?? "";

  const rawFrom = first(searchParams.from);
  const rawTo = first(searchParams.to);
  const rawCurrency = first(searchParams.currency).toUpperCase();

  // The first of the month, 11 months back: 12 months including this one.
  const defaultFrom = startOfMonth(addMonthsUtc(now, -11));

  const from = DATE_ONLY.test(rawFrom) ? dateOnlyToUtc(rawFrom) : defaultFrom;
  const to = DATE_ONLY.test(rawTo) ? dateOnlyToUtc(rawTo) : now;

  const known = currencies.map((option) => option.currency);
  const currency = known.includes(rawCurrency)
    ? rawCurrency
    : (known[0] ?? DEFAULT_CURRENCY);

  // A backwards range would silently show nothing; swapping is what the user meant.
  return from <= to ? { from, to, currency } : { from: to, to: from, currency };
}

function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export type FinanceData = {
  range: FinanceRange;
  /** Orders placed in the range, with every payment ever made against them. */
  projects: FinanceProject[];
  /**
   * Commission received in the range — a different set from `projects`, by a
   * different date. Carries the order and client it came from.
   */
  cashPayments: FinanceReceipt[];
  /** Money spent in the range, on orders and on overheads alike. */
  expenses: FinanceExpense[];
  /** Retainer fees received in the range, in this currency. */
  retainers: FinanceRetainer[];
  /** Rates for the monthly-retainer figure, which is context, not income. */
  clients: Array<{ fixedMonthly: bigint | null; status: string }>;
  samplings: Array<{
    id: string;
    clientId: string;
    clientName: string;
    scheduledDate: Date;
    product: string | null;
  }>;
};

export async function getFinances(range: FinanceRange): Promise<FinanceData> {
  const inCurrency = { ...notDeleted, currency: range.currency };
  const today = todayUtc();

  const [projects, cashPayments, expenses, retainers, clients, samplings] = await Promise.all([
    prisma.project.findMany({
      where: { ...inCurrency, orderDate: { gte: range.from, lte: range.to } },
      select: {
        id: true,
        clientId: true,
        product: true,
        orderId: true,
        clientReference: true,
        orderValue: true,
        commissionPercentage: true,
        status: true,
        orderDate: true,
        expectedDelivery: true,
        actualDelivery: true,
        client: { select: { name: true } },
        // Every payment, not just in-range ones: outstanding is a balance as
        // of now, so a payment made outside the window still counts against it.
        payments: { where: notDeleted, select: { amount: true, paidOn: true } },
      },
    }),

    // Filtered on the payment's own currency, and deliberately not on whether
    // its order still exists: the ledger records money that moved, and a
    // deleted order does not un-take the cash it took.
    prisma.payment.findMany({
      where: {
        ...notDeleted,
        currency: range.currency,
        paidOn: { gte: range.from, lte: range.to },
      },
      select: {
        id: true,
        amount: true,
        paidOn: true,
        projectId: true,
        project: {
          select: { orderId: true, deletedAt: true, client: { select: { name: true } } },
        },
      },
    }),

    // Expenses carry their own currency: one attached to a project inherits
    // that project's, and a general overhead is recorded in whichever currency
    // it was entered in. Either way the filter is on the expense's own column.
    prisma.expense.findMany({
      where: {
        ...notDeleted,
        currency: range.currency,
        incurredOn: { gte: range.from, lte: range.to },
      },
      select: {
        id: true,
        amount: true,
        incurredOn: true,
        description: true,
        category: true,
        // Selected because the passbook edits expenses in place: a form that
        // cannot see the note it is about to resubmit would quietly drop it.
        notes: true,
        projectId: true,
        project: { select: { orderId: true, deletedAt: true } },
        clientId: true,
        client: { select: { name: true } },
      },
    }),

    prisma.retainerReceipt.findMany({
      where: {
        ...notDeleted,
        currency: range.currency,
        paidOn: { gte: range.from, lte: range.to },
      },
      orderBy: { paidOn: "asc" },
      select: {
        id: true,
        amount: true,
        paidOn: true,
        clientId: true,
        client: { select: { name: true } },
      },
    }),

    // Retainers are charged in the client's own currency, so only clients
    // billed in the selected one belong on this page.
    prisma.client.findMany({
      where: { ...notDeleted, currency: range.currency },
      select: { fixedMonthly: true, status: true },
    }),

    prisma.clientSampling.findMany({
      where: {
        ...notDeleted,
        status: "SCHEDULED",
        scheduledDate: { gte: today, lte: addDaysUtc(today, 30) },
      },
      orderBy: { scheduledDate: "asc" },
      select: {
        id: true,
        clientId: true,
        scheduledDate: true,
        product: true,
        client: { select: { name: true } },
      },
    }),
  ]);

  return {
    range,
    projects: projects.map(({ client, ...project }) => ({
      ...project,
      clientName: client.name,
      status: project.status as ProjectStatus,
    })),
    cashPayments: cashPayments.map(({ project, ...payment }) => ({
      ...payment,
      orderId: project.orderId,
      clientName: project.client.name,
      // A deleted order has no page to link to, so the ledger names it
      // without offering a link into a 404.
      orderExists: project.deletedAt === null,
    })),
    expenses: expenses.map(({ project, client, ...expense }) => ({
      ...expense,
      orderId: project?.orderId ?? null,
      orderExists: project ? project.deletedAt === null : false,
      clientName: client?.name ?? null,
    })),
    retainers: retainers.map(({ client, ...retainer }) => ({
      ...retainer,
      clientName: client.name,
    })),
    clients,
    samplings: samplings.map(({ client, ...sampling }) => ({
      ...sampling,
      clientName: client.name,
    })),
  };
}

/** The range as the date inputs want it. */
export function rangeToInputs(range: FinanceRange) {
  return { from: utcToDateOnly(range.from), to: utcToDateOnly(range.to) };
}

/** Clients for the expense picker on the dashboard. */
export async function getClientOptions(): Promise<Array<{ id: string; name: string }>> {
  return prisma.client.findMany({
    where: notDeleted,
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}
