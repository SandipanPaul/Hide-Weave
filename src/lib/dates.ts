/**
 * Dates are stored as UTC and rendered in the viewer's local time.
 *
 * Date-only fields (orderDate, scheduledDate, paidOn) are stored at UTC
 * midnight and must be rendered with the UTC helpers below — formatting them
 * locally would shift them a day for anyone west of Greenwich.
 */

/** "2026-08-19" -> Date at 2026-08-19T00:00:00Z */
export function dateOnlyToUtc(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** Date -> "2026-08-19", reading the UTC calendar day. */
export function utcToDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Formats a date-only value for display, e.g. "19 Aug 2026". */
export function formatDateOnly(date: Date | null | undefined, locale = "en-IN"): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** Formats a true timestamp (createdAt, updatedAt) in the viewer's local zone. */
export function formatTimestamp(date: Date | null | undefined, locale = "en-IN"): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

/** Today at UTC midnight — the reference point for "upcoming" vs "past". */
export function todayUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function addDaysUtc(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function addMonthsUtc(date: Date, months: number): Date {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

/** Whole days between two dates, by UTC calendar day. */
export function daysBetween(from: Date, to: Date): number {
  const MS_PER_DAY = 86_400_000;
  return Math.round((todayUtc(to).getTime() - todayUtc(from).getTime()) / MS_PER_DAY);
}

/** "2026-08" — the bucket key for monthly aggregates. */
export function monthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}
