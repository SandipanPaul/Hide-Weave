/**
 * A client can be reachable at several phone numbers and several email
 * addresses. Real spreadsheets pack them into one cell, separated by whatever
 * the typist felt like, and email addresses are often lightly obfuscated to
 * dodge scrapers.
 *
 * This module turns one messy cell into a clean, ordered, de-duplicated list.
 * It is shared by the client form, the CSV import and duplicate detection, so
 * all three agree on what "the same address" means.
 */
import type { ContactKind } from "@/lib/enums";

/** Comma, semicolon, slash, backslash, pipe, and any newline. */
const DELIMITERS = /[,;/\\|\r\n]+/;

/**
 * Undoes the usual anti-scraping tricks: "info(at)example.com" and
 * "info [at] example [dot] com" both become real addresses.
 *
 * Only bracketed forms are treated as markers — a bare " at " is far more
 * likely to be part of a name or a note than an obfuscated @.
 */
export function deobfuscateEmail(value: string): string {
  return value
    .replace(/\s*[([{<]\s*at\s*[)\]}>]\s*/gi, "@")
    .replace(/\s*[([{<]\s*dot\s*[)\]}>]\s*/gi, ".")
    .trim();
}

/** True when the value looks like an email rather than a phone number. */
export function looksLikeEmail(value: string): boolean {
  return /@/.test(deobfuscateEmail(value));
}

/**
 * Tidies a phone number without being clever about it: collapse whitespace,
 * keep the punctuation people rely on (+, parentheses, dashes).
 */
function normalizePhone(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeEmail(value: string): string {
  return deobfuscateEmail(value).replace(/\s+/g, "").trim();
}

/** Lower-cased form used only for comparison, never for storage. */
export function emailKey(value: string): string {
  return normalizeEmail(value).toLowerCase();
}

/** Digits only, so "+91 98765 43210" and "+919876543210" compare as equal. */
export function phoneKey(value: string): string {
  return value.replace(/\D/g, "");
}

export type { ContactKind };

/**
 * Splits one cell into individual values, in the order they were written,
 * dropping blanks and repeats.
 *
 * De-duplication is by meaning rather than by spelling: two spellings of the
 * same address collapse to one, and the first spelling is the one kept.
 */
export function splitContacts(raw: string | null | undefined, kind: ContactKind): string[] {
  if (!raw) return [];

  const normalize = kind === "EMAIL" ? normalizeEmail : normalizePhone;
  const key = kind === "EMAIL" ? emailKey : phoneKey;

  const seen = new Set<string>();
  const values: string[] = [];

  for (const part of raw.split(DELIMITERS)) {
    const value = normalize(part);
    if (value === "") continue;

    // A phone of "-" or "n/a" is a placeholder, not a number.
    if (kind === "PHONE" && phoneKey(value).length === 0) continue;

    const comparison = key(value) || value.toLowerCase();
    if (seen.has(comparison)) continue;
    seen.add(comparison);
    values.push(value);
  }

  return values;
}

/** Joins values back into one cell, for CSV export and error reports. */
export function joinContacts(values: string[]): string {
  return values.join("; ");
}
