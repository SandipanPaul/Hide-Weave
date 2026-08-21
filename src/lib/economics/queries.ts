import { notDeleted, prisma } from "@/lib/db";
import { addDaysUtc, addMonthsUtc, dateOnlyToUtc, todayUtc, utcToDateOnly } from "@/lib/dates";
import { DEFAULT_CURRENCY } from "@/lib/money";
import type { ProjectStatus } from "@/lib/enums";
import type { EconomicsPayment, EconomicsProject } from "./aggregate";

/**
 * Reads for the Economics dashboard.
 *
 * Everything is derived from Projects, Payments, Clients and Samplings — there
 * is no stored figure anywhere on that page. Rows come back filtered to one
 * currency, because this app never converts between them.
 */

export type EconomicsRange = { from: Date; to: Date; currency: string };

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Currencies in use, most-used first, so the default picks the busiest. */
export async function getCurrencyOptions(): Promise<Array<{ currency: string; projects: number }>> {
  const groups = await prisma.project.groupBy({
    by: ["currency"],
    where: { ...notDeleted, status: { not: "CANCELLED" } },
    _count: { _all: true },
  });

  return groups
    .map((group) => ({ currency: group.currency, projects: group._count._all }))
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
export function parseEconomicsRange(
  searchParams: Record<string, string | string[] | undefined>,
  currencies: Array<{ currency: string }>,
  now = todayUtc(),
): EconomicsRange {
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

export type EconomicsData = {
  range: EconomicsRange;
  /** Orders placed in the range, with every payment ever made against them. */
  projects: EconomicsProject[];
  /** Payments received in the range — a different set, by a different date. */
  cashPayments: EconomicsPayment[];
  clients: Array<{ fixedMonthly: bigint | null; status: string }>;
  samplings: Array<{
    id: string;
    clientId: string;
    clientName: string;
    scheduledDate: Date;
    product: string | null;
  }>;
};

export async function getEconomics(range: EconomicsRange): Promise<EconomicsData> {
  const inCurrency = { ...notDeleted, currency: range.currency };
  const today = todayUtc();

  const [projects, cashPayments, clients, samplings] = await Promise.all([
    prisma.project.findMany({
      where: { ...inCurrency, orderDate: { gte: range.from, lte: range.to } },
      select: {
        id: true,
        clientId: true,
        product: true,
        orderId: true,
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

    prisma.payment.findMany({
      where: {
        ...notDeleted,
        paidOn: { gte: range.from, lte: range.to },
        project: { ...notDeleted, currency: range.currency },
      },
      select: { amount: true, paidOn: true },
    }),

    // Retainers are billed in the client's own currency, so only clients
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
    cashPayments,
    clients,
    samplings: samplings.map(({ client, ...sampling }) => ({
      ...sampling,
      clientName: client.name,
    })),
  };
}

/** The range as the date inputs want it. */
export function rangeToInputs(range: EconomicsRange) {
  return { from: utcToDateOnly(range.from), to: utcToDateOnly(range.to) };
}
