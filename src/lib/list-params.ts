/**
 * Shared plumbing for every list view: text search, column sorting and
 * pagination, all held in the URL so a filtered view can be bookmarked, shared
 * and restored by the back button.
 */

/**
 * Page size for every list view in the app.
 *
 * Deliberately defined here rather than alongside the Prisma client: this
 * module is imported by client components, and anything it imports is bundled
 * for the browser.
 */
export const PAGE_SIZE = 50;

export type SortDirection = "asc" | "desc";

export type ListParams = {
  q: string;
  sort: string;
  dir: SortDirection;
  page: number;
  /**
   * Named filters beyond the text search — client, status, date range. Held
   * as strings because that is what a URL carries; each list decides what its
   * own keys mean. An absent or blank filter is simply not present.
   */
  filters: Record<string, string>;
};

export type RawSearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Reads list state out of the URL, falling back to defaults for anything
 * missing or nonsensical. Never throws — a hand-edited URL degrades to the
 * default view rather than erroring.
 */
export function parseListParams(
  searchParams: RawSearchParams,
  options: {
    allowedSorts: readonly string[];
    defaultSort: string;
    defaultDir?: SortDirection;
    /** Filter params this list understands. Anything else in the URL is ignored. */
    filterKeys?: readonly string[];
  },
): ListParams {
  const rawSort = firstValue(searchParams.sort);
  const rawDir = firstValue(searchParams.dir);
  const rawPage = Number(firstValue(searchParams.page));

  const filters: Record<string, string> = {};
  for (const key of options.filterKeys ?? []) {
    const value = (firstValue(searchParams[key]) ?? "").trim().slice(0, 200);
    if (value) filters[key] = value;
  }

  return {
    q: (firstValue(searchParams.q) ?? "").trim().slice(0, 200),
    sort: rawSort && options.allowedSorts.includes(rawSort) ? rawSort : options.defaultSort,
    dir: rawDir === "asc" || rawDir === "desc" ? rawDir : (options.defaultDir ?? "asc"),
    page: Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1,
    filters,
  };
}

/** Builds a URL with some params changed and the rest preserved. */
export function buildListHref(
  pathname: string,
  current: ListParams,
  changes: Partial<ListParams>,
): string {
  const next = { ...current, ...changes };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.sort) params.set("sort", next.sort);
  if (next.dir) params.set("dir", next.dir);
  if (next.page > 1) params.set("page", String(next.page));
  // Filters ride along with every sort and page link, so narrowing the list
  // and then paging through it doesn't silently widen it again.
  for (const [key, value] of Object.entries(next.filters ?? {})) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/**
 * Clicking the active column flips direction; clicking a new column starts at
 * that column's natural direction. Either way you return to page 1, because
 * page 4 of the old sort is meaningless under the new one.
 */
export function sortHref(
  pathname: string,
  current: ListParams,
  column: string,
  naturalDir: SortDirection = "asc",
): string {
  const isActive = current.sort === column;
  const dir: SortDirection = isActive ? (current.dir === "asc" ? "desc" : "asc") : naturalDir;
  return buildListHref(pathname, current, { sort: column, dir, page: 1 });
}

/**
 * A link with one filter changed. Clearing a filter drops it from the URL
 * entirely rather than leaving `?status=`, and any change returns to page 1.
 */
export function filterHref(
  pathname: string,
  current: ListParams,
  key: string,
  value: string | null,
): string {
  const filters = { ...current.filters };
  if (value) filters[key] = value;
  else delete filters[key];
  return buildListHref(pathname, current, { filters, page: 1 });
}

export type Pagination = {
  page: number;
  pageCount: number;
  total: number;
  from: number;
  to: number;
  skip: number;
  take: number;
};

export function paginate(total: number, page: number, pageSize = PAGE_SIZE): Pagination {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  // Clamp rather than showing an empty page 9 when there are only 3 pages.
  const current = Math.min(Math.max(1, page), pageCount);
  const skip = (current - 1) * pageSize;
  return {
    page: current,
    pageCount,
    total,
    skip,
    take: pageSize,
    from: total === 0 ? 0 : skip + 1,
    to: Math.min(skip + pageSize, total),
  };
}
