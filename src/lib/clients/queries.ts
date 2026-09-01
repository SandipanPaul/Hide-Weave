import { emailKey } from "@/lib/contacts";
import { foldCase } from "@/lib/keys";
import { resolveCountry } from "@/lib/countries";
import { CLIENT_CODES } from "@/lib/codes";
import { notDeleted, prisma, type Db } from "@/lib/db";
import { todayUtc } from "@/lib/dates";
import { OPEN_PROJECT_STATUSES, type ClientStatus } from "@/lib/enums";
import { paginate, PAGE_SIZE, type ListParams, type Pagination } from "@/lib/list-params";

/**
 * Reads for the Clients tab. Everything here filters out soft-deleted rows via
 * `notDeleted`.
 */

export const CLIENT_SORT_COLUMNS = [
  "name",
  "country",
  "phone",
  "email",
  "status",
  "openProjects",
  "nextSampling",
] as const;


/**
 * Columns that are not plain fields on the Client row: two come from
 * aggregates, and phone and email now live in the ClientContact table.
 */
const COMPUTED_SORTS = new Set<string>(["openProjects", "nextSampling", "phone", "email"]);

export type ClientListRow = {
  id: string;
  /** The reference quoted in emails. Null only if a row predates the column. */
  code: string | null;
  name: string;
  address: string | null;
  country: string | null;
  /** Ordered; the first of each is the primary one shown in the list. */
  phones: string[];
  emails: string[];
  status: ClientStatus;
  openProjectCount: number;
  nextSamplingDate: Date | null;
};

const CONTACTS_SELECT = {
  where: notDeleted,
  select: { kind: true, value: true, position: true },
  orderBy: { position: "asc" },
} as const;

/** Just the addresses, for the name-or-email duplicate rules. */
export const EMAIL_CONTACTS_SELECT = {
  where: { ...notDeleted, kind: "EMAIL" },
  select: { value: true },
} as const;

type ContactRow = { kind: string; value: string; position: number };

/** Splits contact rows into ordered phone and email lists. */
export function groupContacts(contacts: ContactRow[]) {
  const byKind = (kind: string) =>
    contacts
      .filter((contact) => contact.kind === kind)
      .sort((a, b) => a.position - b.position)
      .map((contact) => contact.value);
  return { phones: byKind("PHONE"), emails: byKind("EMAIL") };
}

/** Nested-create rows for a client's contacts, numbered in the given order. */
export function contactRows(phones: string[], emails: string[]) {
  return [
    ...phones.map((value, position) => ({ kind: "PHONE", value, position })),
    ...emails.map((value, position) => ({ kind: "EMAIL", value, position })),
  ];
}

function searchFilter(q: string) {
  if (!q) return {};

  // Country is stored as a code, so a search for "India" or "uk" is resolved
  // to its code before it reaches the database.
  const countryCode = resolveCountry(q);
  // SQLite's LIKE is already case-insensitive for ASCII, and Prisma's
  // `mode: "insensitive"` is unsupported there — so plain `contains` is both
  // the portable choice and the one that behaves the same on Postgres for the
  // ASCII text this app holds.
  return {
    OR: [
      { name: { contains: q } },
      // The reference quoted in emails, so a search can start from a subject
      // line. Matched loosely: "42" finds HW-0042 as readily as the full code.
      { code: { contains: q.trim().toUpperCase() } },
      { contactPerson: { contains: q } },
      { address: { contains: q } },
      // Any of the client's phone numbers or addresses, not just the first.
      { contacts: { some: { ...notDeleted, value: { contains: q } } } },
      ...(countryCode ? [{ country: countryCode }] : []),
    ],
  };
}

/** Open project counts and next scheduled sampling, for a set of clients. */
async function loadAggregates(clientIds: string[]) {
  if (clientIds.length === 0) {
    return { openCounts: new Map<string, number>(), nextSamplings: new Map<string, Date>() };
  }

  const [projectGroups, samplingGroups] = await Promise.all([
    prisma.project.groupBy({
      by: ["clientId"],
      where: { clientId: { in: clientIds }, ...notDeleted, status: { in: [...OPEN_PROJECT_STATUSES] } },
      _count: { _all: true },
    }),
    prisma.clientSampling.groupBy({
      by: ["clientId"],
      where: {
        clientId: { in: clientIds },
        ...notDeleted,
        status: "SCHEDULED",
        scheduledDate: { gte: todayUtc() },
      },
      _min: { scheduledDate: true },
    }),
  ]);

  return {
    openCounts: new Map(projectGroups.map((g) => [g.clientId, g._count._all])),
    nextSamplings: new Map(
      samplingGroups
        .filter((g) => g._min.scheduledDate !== null)
        .map((g) => [g.clientId, g._min.scheduledDate as Date]),
    ),
  };
}

type Aggregates = Awaited<ReturnType<typeof loadAggregates>>;
type SortCandidate = { id: string; name: string; contacts: ContactRow[] };

/**
 * The value a computed column sorts on. `null` means the client has none,
 * which sorts last in either direction — absent is not "earliest" or "empty".
 */
function sortKey(
  row: SortCandidate,
  sort: string,
  aggregates: Aggregates,
): string | number | null {
  switch (sort) {
    case "phone":
      return groupContacts(row.contacts).phones[0] ?? null;
    case "email":
      return groupContacts(row.contacts).emails[0] ?? null;
    case "openProjects":
      return aggregates.openCounts.get(row.id) ?? 0;
    default:
      return aggregates.nextSamplings.get(row.id)?.getTime() ?? null;
  }
}

export async function getClientsPage(
  params: ListParams,
): Promise<{ rows: ClientListRow[]; pagination: Pagination }> {
  const where = { ...notDeleted, ...searchFilter(params.q) };
  const total = await prisma.client.count({ where });
  const pagination = paginate(total, params.page, PAGE_SIZE);

  const select = {
    id: true,
    code: true,
    name: true,
    address: true,
    country: true,
    status: true,
    contacts: CONTACTS_SELECT,
  } as const;

  let clients: Array<{
    id: string;
    code: string | null;
    name: string;
    address: string | null;
    country: string | null;
    status: string;
    contacts: ContactRow[];
  }>;
  let aggregates: Aggregates;

  if (COMPUTED_SORTS.has(params.sort)) {
    // Sorting by an aggregate can't be pushed into the row query, so the
    // matching ids are ranked first and only the requested page is hydrated.
    // The id list is small (one row per client) even on a large dataset.
    const candidates = await prisma.client.findMany({
      where,
      select: { id: true, code: true, name: true, contacts: CONTACTS_SELECT },
    });
    aggregates = await loadAggregates(candidates.map((c) => c.id));

    const direction = params.dir === "asc" ? 1 : -1;
    const ranked = [...candidates].sort((a, b) => {
      const aKey = sortKey(a, params.sort, aggregates);
      const bKey = sortKey(b, params.sort, aggregates);

      if (aKey === null || bKey === null) {
        // Ties between two absent values fall through to the name.
        if (aKey !== bKey) return aKey === null ? 1 : -1;
      } else {
        const diff =
          typeof aKey === "string"
            ? aKey.localeCompare(bKey as string)
            : aKey - (bKey as number);
        if (diff !== 0) return diff * direction;
      }
      return a.name.localeCompare(b.name);
    });

    const pageIds = ranked.slice(pagination.skip, pagination.skip + pagination.take).map((c) => c.id);
    const unordered = await prisma.client.findMany({ where: { id: { in: pageIds } }, select });
    const byId = new Map(unordered.map((c) => [c.id, c]));
    clients = pageIds.map((id) => byId.get(id)).filter((c) => c !== undefined);
  } else {
    clients = await prisma.client.findMany({
      where,
      select,
      orderBy: { [params.sort]: params.dir },
      skip: pagination.skip,
      take: pagination.take,
    });
    aggregates = await loadAggregates(clients.map((c) => c.id));
  }

  return {
    rows: clients.map(({ contacts, ...client }) => ({
      ...client,
      ...groupContacts(contacts),
      status: client.status as ClientStatus,
      openProjectCount: aggregates.openCounts.get(client.id) ?? 0,
      nextSamplingDate: aggregates.nextSamplings.get(client.id) ?? null,
    })),
    pagination,
  };
}

/** Full detail for one client, or null when missing or soft-deleted. */
export async function getClient(id: string) {
  return prisma.client.findFirst({
    where: { id, ...notDeleted },
    include: { contacts: CONTACTS_SELECT },
  });
}

/**
 * The next client reference to issue.
 *
 * Reads the highest code rather than counting rows, so a deleted client never
 * frees its number for someone else — see nextClientCode. Takes an optional
 * transaction so it can be read inside the same one that writes the client.
 */
export async function reserveClientCode(db: Db = prisma): Promise<string> {
  // Soft-deleted clients included deliberately: their codes are still spent.
  const rows = await db.client.findMany({ select: { code: true } });
  return CLIENT_CODES.next(rows.map((row) => row.code));
}

/** Every retainer fee this client has paid, newest first. */
export async function getClientRetainerReceipts(clientId: string) {
  return prisma.retainerReceipt.findMany({
    where: { clientId, ...notDeleted },
    orderBy: { paidOn: "desc" },
  });
}

export async function getClientSamplings(clientId: string) {
  return prisma.clientSampling.findMany({
    where: { clientId, ...notDeleted },
    orderBy: { scheduledDate: "asc" },
  });
}

export async function getClientProjects(clientId: string) {
  return prisma.project.findMany({
    where: { clientId, ...notDeleted },
    orderBy: { orderDate: "desc" },
    include: {
      suppliers: {
        where: notDeleted,
        orderBy: { position: "asc" },
        select: { quantity: true, supplier: { select: { id: true, companyName: true } } },
      },
    },
  });
}

/**
 * Finds an existing client colliding with the given name or email, ignoring
 * case and ignoring soft-deleted rows.
 *
 * Uniqueness lives here rather than in a database constraint so that deleting a
 * client frees its name for reuse. The comparison is done in JS because
 * SQLite and Postgres disagree about case-insensitive matching, and this table
 * is small enough that the scan is cheap.
 *
 * `db` lets the CSV import run the same rule inside its transaction, so the
 * form, the action and the import can never disagree about what a duplicate is.
 */
export async function findClientConflict(
  {
    name,
    emails = [],
    excludeId,
  }: {
    name?: string;
    /** Any one of these matching any of a client's addresses is a collision. */
    emails?: string[];
    excludeId?: string;
  },
  db: Db = prisma,
): Promise<{ id: string; name: string; matchedOn: "name" | "email" } | null> {
  const candidates = await db.client.findMany({
    where: notDeleted,
    select: { id: true, name: true, contacts: EMAIL_CONTACTS_SELECT },
  });

  const wantedName = name === undefined ? undefined : foldCase(name);
  const wantedEmails = new Set(emails.map(emailKey).filter(Boolean));

  for (const candidate of candidates) {
    if (candidate.id === excludeId) continue;
    if (wantedName && foldCase(candidate.name) === wantedName) {
      return { id: candidate.id, name: candidate.name, matchedOn: "name" };
    }
    if (candidate.contacts.some((contact) => wantedEmails.has(emailKey(contact.value)))) {
      return { id: candidate.id, name: candidate.name, matchedOn: "email" };
    }
  }
  return null;
}
