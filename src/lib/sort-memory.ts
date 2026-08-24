import type { SortDirection } from "@/lib/list-params";

/**
 * Remembering how each list was last sorted.
 *
 * Sorting is a standing preference — "I work through clients by status" — not
 * a one-off action, so leaving the tab and coming back should not undo it.
 * The URL alone cannot carry that: the nav link is a plain `/clients`, and any
 * arrival without a `sort` param would otherwise land on the default.
 *
 * Only the sort column and direction are remembered. The search text, page
 * number and filters are deliberately *not*: those are things you are doing
 * right now, and returning to a list still filtered to one client — with no
 * hint of why it looks empty — is the kind of help nobody asks for twice.
 *
 * A cookie rather than browser storage so the first server render is already
 * sorted correctly, with no flash of the default order.
 *
 * Everything here is pure. Reading the cookie needs `next/headers`, which only
 * exists on the server, and this module is imported by the client component
 * that writes it — so that half lives in sort-memory.server.ts. Importing
 * `next/headers` from here would drag it into the browser bundle and fail the
 * build.
 */

const PREFIX = "hw.sort.";
const SEPARATOR = ":";

export function sortCookieName(scope: string): string {
  return `${PREFIX}${scope}`;
}

export type RememberedSort = { sort?: string; dir?: SortDirection };

/** Parses a stored "column:direction" pair. Anything malformed is ignored. */
export function parseRememberedSort(value: string | undefined): RememberedSort {
  if (!value) return {};
  const [sort, dir] = value.split(SEPARATOR);
  if (!sort) return {};
  return {
    sort,
    dir: dir === "asc" || dir === "desc" ? dir : undefined,
  };
}

export function formatRememberedSort(sort: string, dir: SortDirection): string {
  return `${sort}${SEPARATOR}${dir}`;
}
