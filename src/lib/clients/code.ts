/**
 * The short reference a client is known by outside the app — "HWC00007" — for
 * quoting in emails and invoices.
 *
 * Separate from the cuid primary key on purpose: the database needs an id that
 * is unique and stable, a person needs one they can read down a phone line and
 * search a mailbox for. Those are different jobs and one value does both badly.
 */

/**
 * "HWC" for Hide & Weave Client. Changing this changes every code issued from
 * here on, but not the ones already issued — so it should not change once any
 * of them have left the building in an email.
 */
const PREFIX = "HWC";

/** Padded so codes sort as text in the same order they were issued, up to 99999. */
const WIDTH = 5;

export function formatClientCode(sequence: number): string {
  return `${PREFIX}${String(sequence).padStart(WIDTH, "0")}`;
}

/**
 * The number inside a code, or null if it is not one of ours.
 *
 * Tolerant of a code that has outgrown its padding: once past 99999 the numbers
 * simply get longer rather than wrapping or colliding.
 */
export function parseClientCode(code: string | null | undefined): number | null {
  if (!code) return null;
  const match = new RegExp(`^${PREFIX}(\\d+)$`).exec(code.trim().toUpperCase());
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

/**
 * The next code to issue, given every code already in use.
 *
 * Takes the highest number seen and adds one, rather than counting rows: codes
 * are never reused, so a deleted client does not free its number for someone
 * else. A reference that pointed at two different clients over time would make
 * the mail it was quoted in ambiguous, which is the whole point of having one.
 *
 * Anything unrecognised is ignored, so a hand-edited value cannot stall the
 * sequence.
 */
export function nextClientCode(existing: Iterable<string | null | undefined>): string {
  let highest = 0;
  for (const code of existing) {
    const value = parseClientCode(code);
    if (value !== null && value > highest) highest = value;
  }
  return formatClientCode(highest + 1);
}
