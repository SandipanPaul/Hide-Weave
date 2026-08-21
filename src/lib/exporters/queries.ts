import { notDeleted, prisma } from "@/lib/db";
import { computeCommission } from "@/lib/money";
import { paginate, PAGE_SIZE, type ListParams, type Pagination } from "@/lib/list-params";
import { foldCase, matchByKey } from "@/lib/keys";
import { websiteKey } from "@/lib/url";

/**
 * Reads for the Exporters tab. Everything here filters out soft-deleted rows
 * via `notDeleted`.
 */

export const EXPORTER_SORT_COLUMNS = [
  "companyName",
  "contactPerson",
  "email",
  "phone",
  "website",
  "projects",
] as const;

export type ExporterSortColumn = (typeof EXPORTER_SORT_COLUMNS)[number];

export type ExporterListRow = {
  id: string;
  companyName: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  projectCount: number;
};

function searchWhere(q: string) {
  if (!q) return {};
  // Portable `contains`: SQLite's LIKE is already case-insensitive for ASCII.
  return {
    OR: [
      { companyName: { contains: q } },
      { contactPerson: { contains: q } },
      { email: { contains: q } },
      { phone: { contains: q } },
      { website: { contains: q } },
      { address: { contains: q } },
    ],
  };
}

const LIST_SELECT = {
  id: true,
  companyName: true,
  contactPerson: true,
  email: true,
  phone: true,
  website: true,
  _count: { select: { projects: { where: notDeleted } } },
} as const;

type ListRecord = {
  id: string;
  companyName: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  _count: { projects: number };
};

function toRow(exporter: ListRecord): ExporterListRow {
  const { _count, ...fields } = exporter;
  return { ...fields, projectCount: _count.projects };
}

export async function getExportersPage(
  params: ListParams,
): Promise<{ rows: ExporterListRow[]; pagination: Pagination }> {
  const where = { ...notDeleted, ...searchWhere(params.q) };
  const total = await prisma.exporter.count({ where });
  const pagination = paginate(total, params.page, PAGE_SIZE);

  // The project count is an aggregate, so it cannot be pushed into orderBy;
  // rank the matching rows first and hydrate only the page being shown.
  if (params.sort === "projects") {
    const candidates = await prisma.exporter.findMany({ where, select: LIST_SELECT });
    const direction = params.dir === "asc" ? 1 : -1;

    const ranked = candidates.map(toRow).sort((a, b) => {
      const diff = a.projectCount - b.projectCount;
      if (diff !== 0) return diff * direction;
      return a.companyName.localeCompare(b.companyName);
    });

    return { rows: ranked.slice(pagination.skip, pagination.skip + pagination.take), pagination };
  }

  const exporters = await prisma.exporter.findMany({
    where,
    select: LIST_SELECT,
    orderBy: { [params.sort]: params.dir },
    skip: pagination.skip,
    take: pagination.take,
  });

  return { rows: exporters.map(toRow), pagination };
}

/**
 * Full detail for one exporter, with the orders sourced through them.
 *
 * Order value is the headline here rather than commission: this measures how
 * much supply has been routed to this exporter, which is a different question
 * from what the agent earned on it.
 */
export async function getExporter(id: string) {
  const exporter = await prisma.exporter.findFirst({
    where: { id, ...notDeleted },
    include: {
      projects: {
        where: notDeleted,
        orderBy: { orderDate: "desc" },
        include: { client: { select: { id: true, name: true } } },
      },
    },
  });
  if (!exporter) return null;

  // Segmented by currency and never summed across them — this app converts
  // nothing. Cancelled orders routed no goods, so they are excluded.
  const totals = new Map<string, { orderValue: bigint; commission: bigint; projects: number }>();
  for (const project of exporter.projects) {
    if (project.status === "CANCELLED") continue;
    const entry = totals.get(project.currency) ?? {
      orderValue: 0n,
      commission: 0n,
      projects: 0,
    };
    entry.orderValue += project.orderValue;
    entry.commission += computeCommission(project.orderValue, project.commissionPercentage);
    entry.projects += 1;
    totals.set(project.currency, entry);
  }

  return {
    ...exporter,
    totals: [...totals.entries()].map(([currency, value]) => ({ currency, ...value })),
  };
}

/**
 * Finds an exporter already using this website, ignoring scheme, "www." and a
 * trailing slash — the same site arriving twice from two sources is one
 * exporter.
 *
 * Uniqueness lives here rather than in a database constraint so a deleted
 * exporter frees its website for reuse.
 */
export async function findWebsiteConflict(
  website: string | null | undefined,
  excludeId?: string,
): Promise<{ id: string; companyName: string } | null> {
  const candidates = await prisma.exporter.findMany({
    where: { ...notDeleted, NOT: { website: null } },
    select: { id: true, companyName: true, website: true },
  });

  return matchByKey(
    candidates,
    (candidate) => websiteKey(candidate.website),
    websiteKey(website),
    excludeId,
  );
}

/** Finds an exporter with the same company name, ignoring case. */
export async function findExporterNameConflict(
  companyName: string,
  excludeId?: string,
): Promise<{ id: string; companyName: string } | null> {
  const candidates = await prisma.exporter.findMany({
    where: notDeleted,
    select: { id: true, companyName: true },
  });

  return matchByKey(
    candidates,
    (candidate) => foldCase(candidate.companyName),
    foldCase(companyName),
    excludeId,
  );
}
