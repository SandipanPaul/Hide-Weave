/**
 * Types for the CSV import flow. Deliberately entity-agnostic: the Clients and
 * Projects tabs both drive the same component and the same server plumbing,
 * parameterised by an ImportConfig rather than duplicated.
 */

/** A cell value after mapping. Blank cells become undefined, never "". */
export type CsvCell = string | undefined;

/** One CSV row keyed by canonical field name, e.g. { name: "Acme", email: … }. */
export type MappedRow = Record<string, CsvCell>;

export type RowIssue = {
  /** Canonical field the issue belongs to; absent for whole-row issues. */
  field?: string;
  message: string;
};

/**
 * valid   — imports cleanly
 * warning — imports, but something is worth seeing first
 * error   — cannot import; excluded from the run and offered back as a CSV
 */
export type RowStatus = "valid" | "warning" | "error";

export type ValidatedRow = {
  /** 1-based position in the file, ignoring the header. Shown to the user. */
  index: number;
  /** The row exactly as parsed, keyed by the file's own headers. */
  raw: Record<string, string>;
  mapped: MappedRow;
  status: RowStatus;
  errors: RowIssue[];
  warnings: RowIssue[];
};

export type ImportFieldDef = {
  /** Canonical name, matching the Zod schema field. */
  key: string;
  label: string;
  required?: boolean;
  /** Extra header spellings to match when guessing the mapping. */
  aliases?: string[];
  /** Value used in the downloadable template's example row. */
  example?: string;
  hint?: string;
};

export type ImportConfig = {
  /** Plural, lower case: "clients", "projects". Used in prose. */
  entityLabel: string;
  fields: ImportFieldDef[];
  /**
   * Validates one mapped row. Pure, and shared by the browser preview and the
   * server action — the preview must never be able to disagree with the import.
   *
   * `mappedKeys` lists which fields the user actually mapped, so a blank
   * optional column can be flagged as a warning while an unmapped one is
   * simply absent.
   */
  validateRow: (mapped: MappedRow, mappedKeys: string[]) => {
    errors: RowIssue[];
    warnings: RowIssue[];
  };
};

/** Which existing record a row collides with, and what to do about it. */
export type DuplicateDecision = "skip" | "update" | "create";

export type DuplicateMatch = {
  rowIndex: number;
  existingId: string;
  existingLabel: string;
  /** What collided, in the user's words: "name", "email", "order ID". */
  matchedOn: string;
};

export type ImportPayloadRow = { index: number; mapped: MappedRow };

export type ImportOutcome =
  | { ok: true; created: number; updated: number; skipped: number; extras: number }
  | {
      ok: false;
      message: string;
      /** The row that broke the transaction, so the user knows where to look. */
      failedRowIndex?: number;
    };
