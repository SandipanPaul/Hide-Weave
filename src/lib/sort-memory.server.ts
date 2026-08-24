import { cookies } from "next/headers";
import {
  parseRememberedSort,
  sortCookieName,
} from "@/lib/sort-memory";
import type { SortDirection } from "@/lib/list-params";

/**
 * How this list was last sorted, resolved against the columns it actually has.
 *
 * The checking matters and cannot be left to `parseListParams`: that validates
 * the *URL's* sort but takes its `defaultSort` on trust, so a cookie naming a
 * column since removed would pass straight through into the database query.
 * A year-old cookie is user data, not a constant.
 */
export async function rememberedSort(
  scope: string,
  allowedSorts: readonly string[],
  fallback: { sort: string; dir: SortDirection },
): Promise<{ sort: string; dir: SortDirection }> {
  const store = await cookies();
  const remembered = parseRememberedSort(store.get(sortCookieName(scope))?.value);

  return {
    sort:
      remembered.sort && allowedSorts.includes(remembered.sort)
        ? remembered.sort
        : fallback.sort,
    dir: remembered.dir ?? fallback.dir,
  };
}
