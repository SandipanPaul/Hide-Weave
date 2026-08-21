import { formatZodError } from "@/lib/schemas";
import type { ImportFieldDef, MappedRow, RowIssue } from "./types";
import type { z } from "zod";

/**
 * Turning validation results into per-row issues, shared by every import
 * config so the Clients and Projects previews report problems the same way.
 */

/**
 * Zod errors, re-labelled with the CSV's own column names.
 *
 * The schema calls them `phones` and `clientId`; the file calls them Phone and
 * Client. Reporting the schema's names would point the user at a column that
 * is not in their spreadsheet.
 */
export function zodIssues(
  error: z.ZodError,
  columnFor: (field: string) => string,
  /** Columns that already have a better message than the schema's. */
  skipFields: ReadonlyArray<string> = [],
): RowIssue[] {
  const issues: RowIssue[] = [];
  const { formErrors, fieldErrors } = formatZodError(error);

  // Object-level rules, like "phone or email", belong to no single column.
  for (const message of formErrors) issues.push({ message });

  for (const [field, messages] of Object.entries(fieldErrors)) {
    const column = columnFor(field);
    if (skipFields.includes(column)) continue;
    for (const message of messages ?? []) issues.push({ field: column, message });
  }

  return issues;
}

/**
 * Warnings for columns the user chose to map but left blank on this row.
 *
 * They meant to bring that data across, so an empty cell is worth seeing —
 * but only for columns where blank is unusual. `quiet` names the ones where it
 * is normal, so the preview does not cry wolf on every row.
 */
export function blankColumnWarnings(
  mapped: MappedRow,
  mappedKeys: ReadonlyArray<string>,
  fields: ReadonlyArray<ImportFieldDef>,
  quiet: ReadonlySet<string>,
): RowIssue[] {
  const warnings: RowIssue[] = [];
  for (const key of mappedKeys) {
    if (quiet.has(key)) continue;
    if (mapped[key] !== undefined) continue;
    const label = fields.find((field) => field.key === key)?.label ?? key;
    warnings.push({ field: key, message: `${label} is empty` });
  }
  return warnings;
}
