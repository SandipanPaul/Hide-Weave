/**
 * Short human-readable references — "HWC00042", "ORD00000042".
 *
 * The database needs ids that are unique and stable; a person needs ones they
 * can quote in an email, read down a phone line and search a mailbox for.
 * Those are different jobs and one value does both badly, so records carry
 * both: a cuid to join on and a reference to talk about.
 *
 * One factory rather than a module per entity, so the rules that matter —
 * never reuse a number, grow rather than wrap, ignore anything unrecognised —
 * are written once and cannot drift apart.
 */

export type CodeSeries = {
  format: (sequence: number) => string;
  parse: (code: string | null | undefined) => number | null;
  next: (existing: Iterable<string | null | undefined>) => string;
};

/**
 * `prefix` identifies the kind of record; `width` is how far numbers are
 * padded. Width is cosmetic only — a series counts past its padding rather
 * than wrapping, so it can never run out or collide.
 *
 * Changing either changes references issued from then on, but not ones already
 * issued, so neither should change once any have been quoted outside the app.
 */
export function codeSeries(prefix: string, width: number): CodeSeries {
  const pattern = new RegExp(`^${prefix}(\\d+)$`);

  const format = (sequence: number) => `${prefix}${String(sequence).padStart(width, "0")}`;

  const parse = (code: string | null | undefined): number | null => {
    if (!code) return null;
    const match = pattern.exec(code.trim().toUpperCase());
    if (!match) return null;
    const value = Number(match[1]);
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  };

  /**
   * The highest number seen plus one — not a row count. A deleted record does
   * not free its number for someone else: a reference that pointed at two
   * records over time would make the correspondence quoting it ambiguous,
   * which is the whole reason for having one.
   *
   * Anything unrecognised is ignored, so a hand-edited value cannot stall the
   * sequence.
   */
  const next = (existing: Iterable<string | null | undefined>) => {
    let highest = 0;
    for (const code of existing) {
      const value = parse(code);
      if (value !== null && value > highest) highest = value;
    }
    return format(highest + 1);
  };

  return { format, parse, next };
}

/** Clients: quoted in email, so the shortest thing that still reads as ours. */
export const CLIENT_CODES = codeSeries("HWC", 5);

/** Orders: deliberately wider, so an order reference cannot be misread as a client one. */
export const ORDER_CODES = codeSeries("ORD", 8);
