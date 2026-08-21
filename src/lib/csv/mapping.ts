import type { ImportConfig, ImportFieldDef, MappedRow } from "./types";

/**
 * Header guessing, mapping application, and CSV writing. All pure — the
 * browser uses them for the preview, the server for the import, and the tests
 * for both.
 */

/** "Contact Person", "contact_person" and "CONTACTPERSON" all reduce to the same key. */
export function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/[\s_\-./\\]+/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

/**
 * Best guess at which field each CSV header belongs to.
 *
 * Only ever a starting point: every column stays overridable in the UI, and an
 * unmapped column is ignored rather than guessed at wildly. A field is claimed
 * by at most one header — the first match wins, so a file with both "email"
 * and "email address" doesn't map both onto the same field.
 */
export function guessMapping(
  headers: string[],
  fields: ImportFieldDef[],
): Record<string, string | null> {
  const byNormalized = new Map<string, string>();
  for (const field of fields) {
    for (const candidate of [field.key, field.label, ...(field.aliases ?? [])]) {
      const normalized = normalizeHeader(candidate);
      // Earlier candidates win, so a field's own key beats another's alias.
      if (!byNormalized.has(normalized)) byNormalized.set(normalized, field.key);
    }
  }

  const mapping: Record<string, string | null> = {};
  const claimed = new Set<string>();

  for (const header of headers) {
    const match = byNormalized.get(normalizeHeader(header));
    if (match && !claimed.has(match)) {
      mapping[header] = match;
      claimed.add(match);
    } else {
      mapping[header] = null;
    }
  }

  return mapping;
}

/**
 * Rewrites a raw row into canonical field names, dropping unmapped columns.
 * Blank and whitespace-only cells become undefined so downstream code has one
 * shape of "no value" to reason about.
 */
export function applyMapping(
  row: Record<string, string>,
  mapping: Record<string, string | null>,
): MappedRow {
  const mapped: MappedRow = {};
  for (const [header, field] of Object.entries(mapping)) {
    if (!field) continue;
    const value = row[header];
    const trimmed = typeof value === "string" ? value.trim() : "";
    mapped[field] = trimmed === "" ? undefined : trimmed;
  }
  return mapped;
}

/** The canonical fields some column points at. */
function mappedFields(mapping: Record<string, string | null>): Set<string> {
  return new Set(Object.values(mapping).filter((v): v is string => v !== null));
}

/** Canonical fields the user actually mapped, in config order. */
export function mappedFieldKeys(
  mapping: Record<string, string | null>,
  fields: ImportFieldDef[],
): string[] {
  const mapped = mappedFields(mapping);
  return fields.filter((field) => mapped.has(field.key)).map((field) => field.key);
}

/** Required fields with no column pointed at them. */
export function missingRequiredFields(
  mapping: Record<string, string | null>,
  fields: ImportFieldDef[],
): ImportFieldDef[] {
  const mapped = mappedFields(mapping);
  return fields.filter((field) => field.required && !mapped.has(field.key));
}

/** Quotes a cell only when it needs it, doubling any embedded quotes. */
export function csvEscape(value: string | undefined | null): string {
  const text = value ?? "";
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function rowsToCsv(headers: string[], rows: Array<Record<string, string>>): string {
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(row[header])).join(","));
  }
  // CRLF: Excel is the most likely destination for a re-upload file.
  return lines.join("\r\n");
}

/** The downloadable starter file: correct headers plus one example row. */
export function buildTemplateCsv(config: ImportConfig): string {
  const headers = config.fields.map((field) => field.label);
  const example: Record<string, string> = {};
  for (const field of config.fields) example[field.label] = field.example ?? "";
  return rowsToCsv(headers, [example]);
}
