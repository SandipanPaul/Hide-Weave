import { ORDER_CODES } from "@/lib/codes";
import { notDeleted, prisma, type Db } from "@/lib/db";
import { dateOnlyToUtc } from "@/lib/dates";
import { PROJECT_STATUSES, type ProjectStatus } from "@/lib/enums";
import { computeCommission } from "@/lib/money";
import { paginate, PAGE_SIZE, type ListParams, type Pagination } from "@/lib/list-params";
import { projectLedger } from "./ledger";

/**
 * Reads for the Projects tab. Like the Clients queries, everything filters out
 * soft-deleted rows via `notDeleted`.
 */

export const PROJECT_SORT_COLUMNS = [
  "orderDate",
  "orderId",
  "product",
  "client",
  "quantity",
  "orderValue",
  "commissionPercentage",
  "commission",
  "status",
] as const;


/** Filters this list understands, and that survive sorting and paging. */
export const PROJECT_FILTER_KEYS = ["clientId", "status", "from", "to", "currency"] as const;

export type ProjectListRow = {
  id: string;
  orderId: string;
  product: string;
  clientId: string;
  clientName: string;
  quantity: number;
  unit: string;
  /** Who is making it, and how much each is making. May be empty. */
  exporters: Array<{ id: string; companyName: string; quantity: number }>;
  orderValue: bigint;
  commissionPercentage: number;
  commission: bigint;
  currency: string;
  status: ProjectStatus;
  orderDate: Date;
};

/** Totals for one currency, over the whole filtered set rather than one page. */
export type CurrencyTotal = {
  currency: string;
  projects: number;
  orderValue: bigint;
  commission: bigint;
};

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Turns the URL's filters into a Prisma `where`. Anything unparseable is
 * dropped rather than erroring — a hand-edited URL degrades to a wider list,
 * never to a crash.
 */
function filterWhere(params: ListParams) {
  const { clientId, status, from, to, currency } = params.filters;
  const orderDate: { gte?: Date; lte?: Date } = {};
  if (from && DATE_ONLY.test(from)) orderDate.gte = dateOnlyToUtc(from);
  if (to && DATE_ONLY.test(to)) orderDate.lte = dateOnlyToUtc(to);

  return {
    ...(clientId ? { clientId } : {}),
    ...(status && (PROJECT_STATUSES as readonly string[]).includes(status) ? { status } : {}),
    ...(currency ? { currency: currency.toUpperCase() } : {}),
    ...(Object.keys(orderDate).length > 0 ? { orderDate } : {}),
  };
}

function searchWhere(q: string) {
  if (!q) return {};
  // Portable `contains`: SQLite's LIKE is already case-insensitive for ASCII,
  // and Prisma's `mode: "insensitive"` is unsupported there.
  return {
    OR: [
      { product: { contains: q } },
      { orderId: { contains: q } },
      // Their PO number — the reference a client actually quotes at you.
      { clientReference: { contains: q } },
      { client: { name: { contains: q } } },
      // Any exporter working on the order, not just the first.
      { exporters: { some: { ...notDeleted, exporter: { companyName: { contains: q } } } } },
    ],
  };
}

const LIST_SELECT = {
  id: true,
  orderId: true,
  clientReference: true,
  product: true,
  clientId: true,
  quantity: true,
  unit: true,
  orderValue: true,
  commissionPercentage: true,
  currency: true,
  status: true,
  orderDate: true,
  client: { select: { name: true } },
  exporters: {
    where: notDeleted,
    orderBy: { position: "asc" },
    select: { quantity: true, exporter: { select: { id: true, companyName: true } } },
  },
} as const;

/** The split, flattened for rendering. */
type AllocationRow = { quantity: number; exporter: { id: string; companyName: string } };

function toExporters(allocations: AllocationRow[]) {
  return allocations.map((allocation) => ({
    id: allocation.exporter.id,
    companyName: allocation.exporter.companyName,
    quantity: allocation.quantity,
  }));
}

/** Commission is computed, never stored, so sorting by it happens in JS. */
const COMPUTED_SORTS = new Set<string>(["commission", "client"]);

function toRow(project: {
  id: string;
  orderId: string;
  product: string;
  clientId: string;
  quantity: number;
  unit: string;
  orderValue: bigint;
  commissionPercentage: number;
  currency: string;
  status: string;
  orderDate: Date;
  client: { name: string };
  exporters: AllocationRow[];
}): ProjectListRow {
  return {
    id: project.id,
    orderId: project.orderId,
    product: project.product,
    clientId: project.clientId,
    clientName: project.client.name,
    exporters: toExporters(project.exporters),
    quantity: project.quantity,
    unit: project.unit,
    orderValue: project.orderValue,
    commissionPercentage: project.commissionPercentage,
    commission: computeCommission(project.orderValue, project.commissionPercentage),
    currency: project.currency,
    status: project.status as ProjectStatus,
    orderDate: project.orderDate,
  };
}

/**
 * Totals for the current filter, segmented by currency.
 *
 * Currencies are never converted or summed together, so this returns one row
 * per currency rather than a single figure. Commission is computed per project
 * because the percentage varies between them.
 */
async function currencyTotals(where: object): Promise<CurrencyTotal[]> {
  const rows = await prisma.project.findMany({
    where,
    select: { currency: true, orderValue: true, commissionPercentage: true, status: true },
  });

  const totals = new Map<string, CurrencyTotal>();
  for (const row of rows) {
    // A cancelled order routed no goods and earned nothing; including it would
    // overstate both figures.
    if (row.status === "CANCELLED") continue;
    const entry = totals.get(row.currency) ?? {
      currency: row.currency,
      projects: 0,
      orderValue: 0n,
      commission: 0n,
    };
    entry.projects += 1;
    entry.orderValue += row.orderValue;
    entry.commission += computeCommission(row.orderValue, row.commissionPercentage);
    totals.set(row.currency, entry);
  }

  return [...totals.values()].sort((a, b) => (b.orderValue > a.orderValue ? 1 : -1));
}

export async function getProjectsPage(params: ListParams): Promise<{
  rows: ProjectListRow[];
  pagination: Pagination;
  totals: CurrencyTotal[];
}> {
  const where = { ...notDeleted, ...filterWhere(params), ...searchWhere(params.q) };

  const [total, totals] = await Promise.all([
    prisma.project.count({ where }),
    currencyTotals(where),
  ]);
  const pagination = paginate(total, params.page, PAGE_SIZE);

  if (COMPUTED_SORTS.has(params.sort)) {
    // Neither commission nor the client's name can be ordered by the database
    // here — one is computed, the other lives on a related row. Rank the ids
    // first, then hydrate only the page being shown.
    const candidates = await prisma.project.findMany({ where, select: LIST_SELECT });
    const direction = params.dir === "asc" ? 1 : -1;

    const ranked = candidates.map(toRow).sort((a, b) => {
      const diff =
        params.sort === "client"
          ? a.clientName.localeCompare(b.clientName)
          : a.commission === b.commission
            ? 0
            : a.commission > b.commission
              ? 1
              : -1;
      if (diff !== 0) return diff * direction;
      // Same client or same commission: newest order first, as elsewhere.
      return b.orderDate.getTime() - a.orderDate.getTime();
    });

    return {
      rows: ranked.slice(pagination.skip, pagination.skip + pagination.take),
      pagination,
      totals,
    };
  }

  const projects = await prisma.project.findMany({
    where,
    select: LIST_SELECT,
    orderBy: { [params.sort]: params.dir },
    skip: pagination.skip,
    take: pagination.take,
  });

  return { rows: projects.map(toRow), pagination, totals };
}

/** Full detail for one project, or null when missing or soft-deleted. */
export async function getProject(id: string) {
  const project = await prisma.project.findFirst({
    where: { id, ...notDeleted },
    include: {
      client: { select: { id: true, name: true, currency: true } },
      exporters: {
        where: notDeleted,
        orderBy: { position: "asc" },
        select: {
          id: true,
          quantity: true,
          exporter: { select: { id: true, companyName: true } },
        },
      },
      payments: { where: notDeleted, orderBy: { paidOn: "asc" } },
      expenses: { where: notDeleted, orderBy: { incurredOn: "asc" } },
    },
  });
  if (!project) return null;

  return {
    ...project,
    ledger: projectLedger(project, project.payments, project.expenses),
  };
}

/** Clients and exporters for the form's pickers and the list's filter. */
export async function getProjectFormOptions() {
  const [clients, exporters] = await Promise.all([
    prisma.client.findMany({
      where: notDeleted,
      select: { id: true, name: true, currency: true },
      orderBy: { name: "asc" },
    }),
    prisma.exporter.findMany({
      where: notDeleted,
      select: { id: true, companyName: true },
      orderBy: { companyName: "asc" },
    }),
  ]);
  return { clients, exporters };
}

/**
 * Finds a project already using this order ID, ignoring case and soft-deleted
 * rows. Uniqueness is enforced here rather than by a database constraint so a
 * deleted project frees its order ID for reuse.
 */
/**
 * The next order reference to issue.
 *
 * Reads every project including soft-deleted ones: their references are spent,
 * and reissuing one would point two orders at the same number.
 */
export async function reserveOrderId(db: Db = prisma): Promise<string> {
  const rows = await db.project.findMany({ select: { orderId: true } });
  return ORDER_CODES.next(rows.map((row) => row.orderId));
}


/** Distinct currencies in use, so the filter only offers what exists. */
export async function getProjectCurrencies(): Promise<string[]> {
  const rows = await prisma.project.groupBy({ by: ["currency"], where: notDeleted });
  return rows.map((row) => row.currency).sort();
}
