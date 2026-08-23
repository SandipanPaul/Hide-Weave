import { notDeleted, prisma } from "@/lib/db";
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
  _count: { select: { allocations: { where: notDeleted } } },
} as const;

type ListRecord = {
  id: string;
  companyName: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  _count: { allocations: number };
};

function toRow(exporter: ListRecord): ExporterListRow {
  const { _count, ...fields } = exporter;
  return { ...fields, projectCount: _count.allocations };
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
      allocations: {
        where: { ...notDeleted, project: notDeleted },
        orderBy: { project: { orderDate: "desc" } },
        select: {
          quantity: true,
          project: {
            select: {
              id: true,
              orderId: true,
              product: true,
              quantity: true,
              unit: true,
              status: true,
              orderDate: true,
              client: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  });
  if (!exporter) return null;

  // What they are making, not what it is worth: money belongs to the order,
  // and lives on the project's own page.
  const projects = exporter.allocations.map(({ project, quantity }) => ({
    id: project.id,
    orderId: project.orderId,
    product: project.product,
    client: project.client,
    status: project.status,
    orderDate: project.orderDate,
    /** This exporter's share of the order. */
    quantity,
    /** The whole order, for context when it is shared. */
    projectQuantity: project.quantity,
    unit: project.unit,
  }));

  return { ...exporter, projects };
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
