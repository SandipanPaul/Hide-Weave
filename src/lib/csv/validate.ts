import { applyMapping, mappedFieldKeys, rowsToCsv } from "./mapping";
import type { ImportConfig, MappedRow, RowStatus, ValidatedRow } from "./types";

/**
 * Corrections the user typed in the preview, keyed by row number then by
 * canonical field. They are layered over the file's own values, so the file on
 * disk is never modified and the edits survive going back to the mapping step.
 */
export type RowOverrides = Record<number, MappedRow>;

/**
 * Turns parsed CSV rows into validated rows.
 *
 * Runs in the browser to build the preview and again in the server action
 * before anything is written — same function, same config, so what the preview
 * shows is exactly what the import will do.
 */
export function validateRows(
  rows: Array<Record<string, string>>,
  mapping: Record<string, string | null>,
  config: ImportConfig,
  overrides: RowOverrides = {},
): ValidatedRow[] {
  const keys = mappedFieldKeys(mapping, config.fields);

  return rows.map((raw, position) => {
    const index = position + 1;
    const mapped = { ...applyMapping(raw, mapping), ...(overrides[index] ?? {}) };
    const { errors, warnings } = config.validateRow(mapped, keys);
    const status: RowStatus =
      errors.length > 0 ? "error" : warnings.length > 0 ? "warning" : "valid";

    return { index, raw, mapped, status, errors, warnings };
  });
}

export type RowCounts = { total: number; valid: number; warning: number; error: number };

export function countByStatus(rows: ValidatedRow[]): RowCounts {
  const counts: RowCounts = { total: rows.length, valid: 0, warning: 0, error: 0 };
  for (const row of rows) counts[row.status] += 1;
  return counts;
}

/**
 * The report offered after an import: the rows that failed, plus why.
 *
 * Any corrections made in the preview are written back into the file, so a row
 * that was partly fixed comes back partly fixed rather than reverting to what
 * was originally uploaded.
 */
export function buildFailedRowsCsv(
  rows: ValidatedRow[],
  headers: string[],
  mapping: Record<string, string | null> = {},
): string {
  const withError = rows.filter((row) => row.errors.length > 0);
  if (withError.length === 0) return "";

  const outputHeaders = [...headers, "_error"];
  const lines = withError.map((row) => {
    const corrected: Record<string, string> = { ...row.raw };
    for (const [header, field] of Object.entries(mapping)) {
      if (field) corrected[header] = row.mapped[field] ?? "";
    }
    return {
    ...corrected,
    _error: row.errors
      .map((issue) => (issue.field ? `${issue.field}: ${issue.message}` : issue.message))
      .join("; "),
    };
  });

  return rowsToCsv(outputHeaders, lines);
}
