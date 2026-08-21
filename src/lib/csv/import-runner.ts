import { prisma, type TransactionClient } from "@/lib/db";
import type { DuplicateDecision, ImportOutcome, ImportPayloadRow } from "./types";

/**
 * The transaction plumbing every CSV import shares.
 *
 * The whole file imports or none of it does: a half-imported spreadsheet is
 * worse than none, because there is no way to tell which half. When a row
 * fails, the transaction rolls back and the row number comes back with it, so
 * the user knows where to look.
 */

/** Thrown inside the transaction to roll everything back and name the row. */
export class ImportRowError extends Error {
  constructor(
    readonly rowIndex: number,
    readonly detail: string,
  ) {
    super(detail);
  }
}

/** What one row did. `extras` counts side records, e.g. a sampling created with a client. */
export type RowResult = { outcome: "created" | "updated"; extras?: number };

export async function runImport(
  rows: ImportPayloadRow[],
  decisions: Record<number, DuplicateDecision>,
  importRow: (
    tx: TransactionClient,
    row: ImportPayloadRow,
    decision: "create" | "update",
  ) => Promise<RowResult>,
): Promise<ImportOutcome> {
  if (rows.length === 0) {
    return { ok: false, message: "There was nothing to import." };
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let extras = 0;

  try {
    await prisma.$transaction(async (tx) => {
      for (const row of rows) {
        // "create" is the default: a row nobody flagged as a duplicate is new.
        const decision = decisions[row.index] ?? "create";
        if (decision === "skip") {
          skipped += 1;
          continue;
        }

        const result = await importRow(tx, row, decision);
        if (result.outcome === "created") created += 1;
        else updated += 1;
        extras += result.extras ?? 0;
      }
    });
  } catch (error) {
    if (error instanceof ImportRowError) {
      return {
        ok: false,
        failedRowIndex: error.rowIndex,
        message: `Row ${error.rowIndex} stopped the import — ${error.detail} Nothing was imported.`,
      };
    }
    return {
      ok: false,
      message:
        error instanceof Error
          ? `The import failed and nothing was saved: ${error.message}`
          : "The import failed and nothing was saved.",
    };
  }

  return { ok: true, created, updated, skipped, extras };
}
