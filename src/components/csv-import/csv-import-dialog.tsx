"use client";

import { useMemo, useState, useTransition } from "react";
import Papa from "papaparse";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
} from "lucide-react";
import { MappingStep } from "./mapping-step";
import { PreviewStep } from "./preview-step";
import { ErrorNote } from "@/components/form/error-note";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { downloadCsv } from "@/lib/csv/download";
import { buildTemplateCsv, guessMapping, mappedFieldKeys, missingRequiredFields } from "@/lib/csv/mapping";
import type {
  DuplicateDecision,
  DuplicateMatch,
  ImportConfig,
  ImportOutcome,
  ImportPayloadRow,
} from "@/lib/csv/types";
import {
  buildFailedRowsCsv,
  countByStatus,
  validateRows,
  type RowOverrides,
} from "@/lib/csv/validate";

/**
 * The CSV import, shared by every tab that needs one. Nothing here knows about
 * clients or projects — the entity arrives as `config` plus the two server
 * actions that check duplicates and perform the import.
 *
 * The flow is deliberately unhurried: upload, map columns, review every row's
 * validation state and decide about duplicates, read a summary, and only then
 * confirm.
 */

type Step = "upload" | "map" | "preview" | "result";

/** The one sentence the toast and the result panel both report. */
function importedSummary(created: number, updated: number, entityLabel: string): string {
  return `Imported ${created} new ${entityLabel}${updated > 0 ? `, updated ${updated}` : ""}.`;
}

export type CsvImportDialogProps = {
  config: ImportConfig;
  /** Both are server actions supplied by the owning tab. */
  checkDuplicates: (rows: ImportPayloadRow[]) => Promise<DuplicateMatch[]>;
  importRows: (
    rows: ImportPayloadRow[],
    decisions: Record<number, DuplicateDecision>,
  ) => Promise<ImportOutcome>;
  triggerLabel?: string;
  onFinished?: () => void;
};

export function CsvImportDialog({
  config,
  checkDuplicates,
  importRows,
  triggerLabel = "Import CSV",
  onFinished,
}: CsvImportDialogProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Array<Record<string, string>>>([]);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [duplicates, setDuplicates] = useState<Map<number, DuplicateMatch>>(new Map());
  const [decisions, setDecisions] = useState<Record<number, DuplicateDecision>>({});
  const [edits, setEdits] = useState<RowOverrides>({});
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [isBusy, startWork] = useTransition();

  const validated = useMemo(
    () => (rawRows.length > 0 ? validateRows(rawRows, mapping, config, edits) : []),
    [rawRows, mapping, config, edits],
  );
  const counts = useMemo(() => countByStatus(validated), [validated]);
  const keys = useMemo(() => mappedFieldKeys(mapping, config.fields), [mapping, config.fields]);

  const importable = validated.filter(
    (row) => row.status !== "error" && (decisions[row.index] ?? "create") !== "skip",
  );
  const skippedDuplicates = validated.filter(
    (row) => row.status !== "error" && decisions[row.index] === "skip",
  ).length;

  /**
   * Closing must always reset. Setting `open` directly does not fire
   * onOpenChange, so every close path goes through here — otherwise reopening
   * the dialog lands back on the previous run's result screen.
   */
  function close() {
    setOpen(false);
    reset();
  }

  function reset() {
    setStep("upload");
    setFileName("");
    setHeaders([]);
    setRawRows([]);
    setMapping({});
    setEdits({});
    setEditingRow(null);
    setDuplicates(new Map());
    setDecisions({});
    setParseError(null);
    setOutcome(null);
  }

  function handleFile(file: File | undefined) {
    if (!file) return;
    setParseError(null);
    setFileName(file.name);

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (header) => header.trim(),
      complete: (results) => {
        const fields = (results.meta.fields ?? []).filter((field) => field !== "");
        if (fields.length === 0) {
          setParseError("That file has no column headers in its first row.");
          return;
        }
        if (results.data.length === 0) {
          setParseError("That file has headers but no rows of data.");
          return;
        }

        // Papa reports recoverable problems per row; surface them rather than
        // letting a ragged file look clean.
        const fatal = results.errors.find((error) => error.type === "Delimiter");
        if (fatal) {
          setParseError(`That file could not be read as CSV: ${fatal.message}`);
          return;
        }

        setHeaders(fields);
        setRawRows(results.data);
        setMapping(guessMapping(fields, config.fields));
        setStep("map");
      },
      error: (error) => setParseError(`That file could not be read: ${error.message}`),
    });
  }

  /**
   * Re-runs duplicate detection against the current values. Decisions already
   * made are kept for rows still flagged; anything newly flagged defaults to
   * skipping, which is the safe choice for a record that already exists.
   */
  function refreshDuplicates(onDone?: () => void) {
    const rows: ImportPayloadRow[] = validated
      .filter((row) => row.status !== "error")
      .map((row) => ({ index: row.index, mapped: row.mapped }));

    startWork(async () => {
      try {
        const matches = await checkDuplicates(rows);
        const map = new Map(matches.map((match) => [match.rowIndex, match]));
        setDuplicates(map);
        setDecisions((current) =>
          Object.fromEntries(
            [...map.keys()].map((index) => [index, current[index] ?? ("skip" as const)]),
          ),
        );
        onDone?.();
      } catch {
        toast.error("Could not check for existing records. Please try again.");
      }
    });
  }

  function goToPreview() {
    refreshDuplicates(() => setStep("preview"));
  }

  function editCell(rowIndex: number, field: string, value: string) {
    setEdits((current) => ({
      ...current,
      [rowIndex]: { ...(current[rowIndex] ?? {}), [field]: value },
    }));
  }

  function resetRow(rowIndex: number) {
    setEdits((current) => {
      const next = { ...current };
      delete next[rowIndex];
      return next;
    });
  }

  /**
   * Closing the editor re-checks duplicates, since editing a name or an email
   * can create a collision — or clear one.
   */
  function finishEditing(rowIndex: number | null) {
    const wasEditing = editingRow;
    setEditingRow(rowIndex);
    if (wasEditing !== null && rowIndex === null && edits[wasEditing]) {
      const touched = Object.keys(edits[wasEditing] ?? {});
      if (touched.includes("name") || touched.includes("email")) refreshDuplicates();
    }
  }

  function runImport() {
    const rows: ImportPayloadRow[] = importable.map((row) => ({
      index: row.index,
      mapped: row.mapped,
    }));

    startWork(async () => {
      try {
        const result = await importRows(rows, decisions);
        setOutcome(result);
        setStep("result");
        if (result.ok) {
          toast.success(importedSummary(result.created, result.updated, config.entityLabel));
          onFinished?.();
        }
      } catch {
        setOutcome({ ok: false, message: "The import failed and nothing was saved." });
        setStep("result");
      }
    });
  }

  const missing = missingRequiredFields(mapping, config.fields);
  const failedCsv = buildFailedRowsCsv(validated, headers, mapping);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger render={<Button variant="outline" />}>
        <Upload className="size-4" aria-hidden />
        {triggerLabel}
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] min-w-0 sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Import {config.entityLabel} from CSV</DialogTitle>
          <DialogDescription>
            {step === "upload" && "Choose a file. Nothing is saved until you confirm."}
            {step === "map" && `Match the columns in ${fileName} to fields.`}
            {step === "preview" && "Check the rows, then confirm."}
            {step === "result" && "Import finished."}
          </DialogDescription>
        </DialogHeader>

        {step === "upload" ? (
          <div className="space-y-4">
            <label
              htmlFor="csv-file"
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-12 text-center transition-colors hover:bg-muted/50 focus-within:ring-2 focus-within:ring-ring"
            >
              <FileSpreadsheet className="size-8 text-muted-foreground" aria-hidden />
              <span className="text-sm font-medium">Choose a CSV file</span>
              <span className="text-xs text-muted-foreground">
                The first row must be column headers.
              </span>
              <input
                id="csv-file"
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(event) => handleFile(event.target.files?.[0])}
              />
            </label>

            {parseError ? <ErrorNote>{parseError}</ErrorNote> : null}

            <div className="flex justify-between border-t pt-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  downloadCsv(`${config.entityLabel}-template.csv`, buildTemplateCsv(config))
                }
              >
                <Download className="size-4" aria-hidden />
                Download template CSV
              </Button>
            </div>
          </div>
        ) : null}

        {step === "map" ? (
          <>
            <MappingStep
              config={config}
              headers={headers}
              mapping={mapping}
              sampleRow={rawRows[0]}
              onChange={(header, field) =>
                setMapping((current) => ({ ...current, [header]: field }))
              }
            />
            <div className="flex items-center justify-between gap-3 border-t pt-3">
              <p className="text-sm text-muted-foreground">
                {rawRows.length} row{rawRows.length === 1 ? "" : "s"} in {fileName}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={reset}>
                  <ArrowLeft className="size-4" aria-hidden />
                  Choose another file
                </Button>
                <Button onClick={goToPreview} disabled={missing.length > 0 || isBusy}>
                  {isBusy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                  Preview {rawRows.length} rows
                </Button>
              </div>
            </div>
          </>
        ) : null}

        {step === "preview" ? (
          <>
            <PreviewStep
              config={config}
              rows={validated}
              mappedKeys={keys}
              duplicates={duplicates}
              decisions={decisions}
              onDecision={(rowIndex, decision) =>
                setDecisions((current) => ({ ...current, [rowIndex]: decision }))
              }
              editingRow={editingRow}
              onToggleEdit={finishEditing}
              edits={edits}
              onEdit={editCell}
              onResetRow={resetRow}
            />

            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-t pt-3">
              {/* The summary the confirm button acts on. */}
              <p className="text-sm" aria-live="polite">
                <span className="font-medium">
                  {counts.total} row{counts.total === 1 ? "" : "s"}:
                </span>{" "}
                {importable.length} will import
                {skippedDuplicates > 0 ? `, ${skippedDuplicates} skipped as duplicates` : ""}
                {counts.error > 0
                  ? `, ${counts.error} ${counts.error === 1 ? "has" : "have"} errors`
                  : ""}
                .
              </p>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep("map")} disabled={isBusy}>
                  <ArrowLeft className="size-4" aria-hidden />
                  Back to mapping
                </Button>
                <Button onClick={runImport} disabled={importable.length === 0 || isBusy}>
                  {isBusy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                  Import {importable.length} {config.entityLabel}
                </Button>
              </div>
            </div>
          </>
        ) : null}

        {step === "result" && outcome ? (
          <div className="space-y-4">
            {outcome.ok ? (
              <div className="flex items-start gap-3 rounded-lg border px-4 py-3">
                <CheckCircle2
                  className="mt-0.5 size-5 text-emerald-600 dark:text-emerald-500"
                  aria-hidden
                />
                <div className="space-y-1 text-sm">
                  <p className="font-medium">
                    {importedSummary(outcome.created, outcome.updated, config.entityLabel)}
                  </p>
                  {outcome.skipped > 0 ? (
                    <p className="text-muted-foreground">
                      {outcome.skipped} skipped as duplicates.
                    </p>
                  ) : null}
                  {outcome.extras > 0 ? (
                    <p className="text-muted-foreground">
                      {outcome.extras} sampling{outcome.extras === 1 ? "" : "s"} scheduled.
                    </p>
                  ) : null}
                </div>
              </div>
            ) : (
              <ErrorNote>{outcome.message}</ErrorNote>
            )}

            {counts.error > 0 ? (
              <div className="rounded-lg border px-4 py-3 text-sm">
                <p className="font-medium">
                  {counts.error} row{counts.error === 1 ? "" : "s"} could not be imported.
                </p>
                <p className="mt-1 text-muted-foreground">
                  Download them with an added <code>_error</code> column, fix them, and upload
                  again.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() =>
                    downloadCsv(`${config.entityLabel}-failed-rows.csv`, failedCsv)
                  }
                >
                  <Download className="size-4" aria-hidden />
                  Download failed rows
                </Button>
              </div>
            ) : null}

            <div className="flex justify-end gap-2 border-t pt-3">
              <Button variant="outline" onClick={reset}>
                Import another file
              </Button>
              <Button onClick={close}>Done</Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
