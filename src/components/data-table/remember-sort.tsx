"use client";

import { useEffect } from "react";
import { formatRememberedSort, sortCookieName } from "@/lib/sort-memory";
import type { SortDirection } from "@/lib/list-params";

/**
 * Records how this list is currently sorted, so returning to the tab restores
 * it — see src/lib/sort-memory.ts for why this is a cookie.
 *
 * Takes the *effective* sort rather than reading the URL: the server has
 * already resolved it, whether it came from a URL parameter or from the cookie
 * itself. Writing what is actually on screen means the two can never disagree.
 */
export function RememberSort({
  scope,
  sort,
  dir,
}: {
  scope: string;
  sort: string;
  dir: SortDirection;
}) {
  useEffect(() => {
    const value = encodeURIComponent(formatRememberedSort(sort, dir));
    // A year, path-wide, and Lax: this is a display preference, not a secret.
    document.cookie = `${sortCookieName(scope)}=${value}; path=/; max-age=31536000; samesite=lax`;
  }, [scope, sort, dir]);

  return null;
}
