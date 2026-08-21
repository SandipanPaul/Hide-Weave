/**
 * All money in this app is an integer count of minor units (paise for INR,
 * cents for USD) held in a `bigint`. No float ever touches a monetary value —
 * floats are only ever used for the commission *percentage*, and even that is
 * scaled to an integer before it multiplies anything.
 *
 * `bigint` rather than `number` because a 32-bit int caps out at ~₹2.14 crore
 * per order, which real consignments exceed.
 */

/** Minor-unit digits per currency. Anything unlisted is assumed to have 2. */
const MINOR_DIGITS: Record<string, number> = {
  INR: 2,
  USD: 2,
  EUR: 2,
  GBP: 2,
  AED: 2,
  SGD: 2,
  AUD: 2,
  CAD: 2,
  JPY: 0,
  KRW: 0,
};

export const DEFAULT_CURRENCY = "INR";

/** Currencies offered in pickers. Not a restriction — free text is accepted. */
export const COMMON_CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD"] as const;

export function minorDigits(currency: string): number {
  return MINOR_DIGITS[currency.toUpperCase()] ?? 2;
}

/** Integer division that floors (rounds toward -Infinity) for any sign. */
function floorDiv(a: bigint, b: bigint): bigint {
  const q = a / b;
  return a % b !== 0n && a < 0n !== b < 0n ? q - 1n : q;
}

/**
 * Percentages are floats, so scale them to integers before they touch money.
 * 1e6 keeps six decimal places of a percentage — far more precision than any
 * real commission rate needs, and well inside float's exact-integer range.
 */
const PCT_SCALE = 1_000_000n;
const COMMISSION_DIVISOR = 100n * PCT_SCALE;

export class MoneyError extends Error {}

/**
 * THE commission calculation. Every commission figure in the app — lists,
 * detail pages, dashboards, CSV exports — comes from this function. Do not
 * inline this arithmetic anywhere else.
 *
 *   commission = round(orderValue * commissionPercentage / 100)
 *
 * Rounding is half-up (a tie goes to the larger value), computed in exact
 * integer arithmetic.
 */
export function computeCommission(orderValue: bigint, commissionPercentage: number): bigint {
  if (!Number.isFinite(commissionPercentage)) {
    throw new MoneyError("Commission percentage must be a finite number.");
  }
  if (commissionPercentage < 0 || commissionPercentage > 100) {
    throw new MoneyError("Commission percentage must be between 0 and 100.");
  }
  const scaledPct = BigInt(Math.round(commissionPercentage * Number(PCT_SCALE)));
  const numerator = orderValue * scaledPct;
  // Adding half the divisor before flooring is exactly half-up rounding.
  return floorDiv(numerator + COMMISSION_DIVISOR / 2n, COMMISSION_DIVISOR);
}

/**
 * Splits a minor-unit amount into its sign, whole part and fractional part,
 * as strings, without ever converting through a float.
 */
function splitMinor(minor: bigint, digits: number) {
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  if (digits === 0) return { negative, whole: abs.toString(), fraction: "" };
  const factor = 10n ** BigInt(digits);
  const whole = (abs / factor).toString();
  const fraction = (abs % factor).toString().padStart(digits, "0");
  return { negative, whole, fraction };
}

/** "1234567" (paise, INR) -> "12345.67". Plain, no grouping, no symbol. */
export function minorToMajorString(minor: bigint, currency: string): string {
  const digits = minorDigits(currency);
  const { negative, whole, fraction } = splitMinor(minor, digits);
  const body = digits === 0 ? whole : `${whole}.${fraction}`;
  return negative ? `-${body}` : body;
}

/**
 * INR reads naturally only with lakh/crore grouping, so the locale follows the
 * currency unless the caller says otherwise.
 */
function localeFor(currency: string, locale?: string): string {
  return locale ?? (currency === "INR" ? "en-IN" : "en-US");
}

/**
 * Shared by both formatters. Intl accepts a numeric *string* and formats it
 * exactly, avoiding the precision loss a bigint -> number conversion would
 * introduce — and an unknown ISO code falls back to the plain number rather
 * than throwing.
 */
function format(
  minor: bigint,
  currency: string,
  locale: string,
  options: Intl.NumberFormatOptions,
  fallback: (major: string) => string,
): string {
  const major = minorToMajorString(minor, currency);
  try {
    return new Intl.NumberFormat(locale, options).format(major as unknown as number);
  } catch {
    return fallback(major);
  }
}

/**
 * Formats for display, with the currency symbol and locale grouping (so INR
 * gets lakh/crore grouping under en-IN).
 */
export function formatMoney(
  minor: bigint,
  currency: string,
  opts: { locale?: string; compact?: boolean } = {},
): string {
  const cur = currency.toUpperCase();
  const digits = minorDigits(cur);
  return format(
    minor,
    cur,
    localeFor(cur, opts.locale),
    {
      style: "currency",
      currency: cur,
      // Compact keeps one decimal: rounding to whole units turned ₹3.7M into
      // "₹4M" and made axis ticks read as a sequence that was never there.
      minimumFractionDigits: opts.compact ? 0 : digits,
      maximumFractionDigits: opts.compact ? 1 : digits,
      notation: opts.compact ? "compact" : "standard",
    },
    (major) => `${cur} ${major}`,
  );
}

/** Formats without the currency symbol — for table cells with a currency column. */
export function formatMoneyPlain(minor: bigint, currency: string, locale?: string): string {
  const cur = currency.toUpperCase();
  const digits = minorDigits(cur);
  return format(
    minor,
    cur,
    localeFor(cur, locale),
    { minimumFractionDigits: digits, maximumFractionDigits: digits },
    (major) => major,
  );
}

/**
 * Parses user input ("12,34,567.89", "1234567.89", " 12 345,00 " is NOT
 * accepted — comma is a thousands separator only) into minor units.
 *
 * Throws MoneyError with a message fit to show a user. More decimal places than
 * the currency supports is an error rather than a silent round, so a typo like
 * "100.005" is surfaced instead of quietly becoming ₹100.01.
 */
export function parseMoneyToMinor(input: string, currency: string): bigint {
  const digits = minorDigits(currency);
  const cleaned = input.trim().replace(/,/g, "").replace(/\s/g, "");
  if (cleaned === "") throw new MoneyError("Enter an amount.");
  const match = /^(-)?(\d+)(?:\.(\d*))?$/.exec(cleaned);
  if (!match) throw new MoneyError("Enter a plain number, e.g. 125000.50");

  const [, sign, whole, rawFraction = ""] = match;
  if (rawFraction.length > digits) {
    throw new MoneyError(
      digits === 0
        ? `${currency.toUpperCase()} amounts cannot have decimal places.`
        : `Use at most ${digits} decimal place${digits === 1 ? "" : "s"}.`,
    );
  }
  const fraction = rawFraction.padEnd(digits, "0");
  const minor = BigInt(whole + fraction);
  return sign === "-" ? -minor : minor;
}

/**
 * Minor units as a plain number of major units — 250000n paise -> 2500.
 *
 * **Display only.** This is for charting libraries, which cannot take a
 * bigint. Never feed the result back into money arithmetic: that is exactly
 * the float rounding this app exists to avoid.
 */
export function minorToMajorNumber(minor: bigint, currency: string): number {
  return Number(minorToMajorString(minor, currency));
}

/**
 * The inverse of `minorToMajorNumber`, for formatting a value that has already
 * been through a chart. **Display only**, for the same reason.
 */
export function majorNumberToMinor(major: number, currency: string): bigint {
  const factor = 10 ** minorDigits(currency);
  return BigInt(Math.round(major * factor));
}

/**
 * Percentage of `part` relative to `whole`, as a float, for display only.
 * Never feed the result back into money math.
 */
export function percentOf(part: bigint, whole: bigint): number {
  if (whole === 0n) return 0;
  return (Number(part) / Number(whole)) * 100;
}

/** Sums minor amounts. Empty list is 0, not undefined. */
export function sumMinor(values: Iterable<bigint>): bigint {
  let total = 0n;
  for (const v of values) total += v;
  return total;
}

/**
 * Commission percentage across many orders, weighted by order value — an
 * average of the percentages themselves would over-weight small orders.
 */
export function weightedCommissionPercentage(
  rows: Array<{ orderValue: bigint; commissionPercentage: number }>,
): number {
  const totalValue = sumMinor(rows.map((r) => r.orderValue));
  if (totalValue === 0n) return 0;
  const totalCommission = sumMinor(
    rows.map((r) => computeCommission(r.orderValue, r.commissionPercentage)),
  );
  return percentOf(totalCommission, totalValue);
}
