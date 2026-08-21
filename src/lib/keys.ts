/**
 * Comparison keys and the lookup that uses them.
 *
 * Uniqueness in this app is enforced in server actions rather than by database
 * constraints, so that deleting a record frees its name, order ID or website
 * for reuse. That means comparing in JS — SQLite and Postgres disagree about
 * case-insensitive matching — and every one of those comparisons reduces a
 * value to a key first.
 */

/** Trimmed and case-folded: how names and order IDs are compared. */
export function foldCase(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/**
 * The first row whose key matches, ignoring one id (the record being edited).
 *
 * An empty key never matches anything: a record with no website must not
 * collide with every other record that has no website.
 */
export function matchByKey<T extends { id: string }>(
  rows: readonly T[],
  keyOf: (row: T) => string,
  wanted: string,
  excludeId?: string,
): T | null {
  if (wanted === "") return null;
  return rows.find((row) => row.id !== excludeId && keyOf(row) === wanted) ?? null;
}
