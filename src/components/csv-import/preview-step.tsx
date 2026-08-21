"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  Filter,
  Pencil,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type {
  DuplicateDecision,
  DuplicateMatch,
  ImportConfig,
  ValidatedRow,
} from "@/lib/csv/types";

const PREVIEW_LIMIT = 20;

const DECISION_LABELS: Record<DuplicateDecision, string> = {
  skip: "Skip",
  update: "Update existing",
  create: "Import anyway",
};

function StatusIcon({ row }: { row: ValidatedRow }) {
  if (row.status === "error") {
    return <AlertCircle className="size-4 text-destructive" aria-hidden />;
  }
  if (row.status === "warning") {
    return <AlertTriangle className="size-4 text-amber-600 dark:text-amber-500" aria-hidden />;
  }
  return <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-500" aria-hidden />;
}

/**
 * Correcting one row. Deliberately rendered outside the table: the table
 * scrolls sideways when there are many columns, and an editor living inside it
 * would scroll off with them.
 */
function RowEditor({
  row,
  columns,
  edits,
  onEdit,
  onReset,
  onClose,
}: {
  row: ValidatedRow;
  columns: ImportConfig["fields"];
  edits: Record<string, string | undefined>;
  onEdit: (field: string, value: string) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const hasEdits = Object.keys(edits).length > 0;
  // Issues with no field of their own, e.g. "phone or email".
  const rowLevelErrors = row.errors.filter((issue) => !issue.field);

  useEffect(() => {
    ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [row.index]);

  return (
    <div ref={ref} className="space-y-3 rounded-lg border bg-muted/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium">
          Fixing row {row.index} — corrections apply to this import only, not to the file on your
          computer.
        </p>
        <div className="flex items-center gap-2">
          {hasEdits ? (
            <Button variant="ghost" size="xs" onClick={onReset}>
              <RotateCcw className="size-3.5" aria-hidden />
              Undo my changes
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="xs"
            aria-label={`Finish editing row ${row.index}`}
            onClick={onClose}
          >
            <Check className="size-3.5" aria-hidden />
            Done
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {columns.map((field) => {
          const issue = row.errors.find((error) => error.field === field.key);
          const inputId = `row-${row.index}-${field.key}`;
          const edited = edits[field.key] !== undefined;

          return (
            <div key={field.key} className="space-y-1.5">
              <Label htmlFor={inputId} className="text-xs">
                {field.label}
                {field.required ? (
                  <span className="text-destructive" aria-hidden>
                    *
                  </span>
                ) : null}
                {edited ? (
                  <span className="font-normal text-muted-foreground">(edited)</span>
                ) : null}
              </Label>
              <Input
                id={inputId}
                value={row.mapped[field.key] ?? ""}
                onChange={(event) => onEdit(field.key, event.target.value)}
                aria-invalid={issue ? true : undefined}
                aria-describedby={issue ? `${inputId}-error` : undefined}
              />
              {issue ? (
                <p id={`${inputId}-error`} className="text-xs font-medium text-destructive">
                  {issue.message}
                </p>
              ) : null}
              {field.hint && !issue ? (
                <p className="text-xs text-muted-foreground">{field.hint}</p>
              ) : null}
            </div>
          );
        })}
      </div>

      {rowLevelErrors.length > 0 ? (
        <p role="alert" className="text-xs font-medium text-destructive">
          {rowLevelErrors.map((issue) => issue.message).join(" ")}
        </p>
      ) : null}

      {row.status !== "error" ? (
        <p className="text-xs font-medium text-emerald-700 dark:text-emerald-500">
          This row is ready to import.
        </p>
      ) : null}
    </div>
  );
}

export function PreviewStep({
  config,
  rows,
  mappedKeys,
  duplicates,
  decisions,
  onDecision,
  editingRow,
  onToggleEdit,
  edits,
  onEdit,
  onResetRow,
}: {
  config: ImportConfig;
  rows: ValidatedRow[];
  mappedKeys: string[];
  duplicates: Map<number, DuplicateMatch>;
  decisions: Record<number, DuplicateDecision>;
  onDecision: (rowIndex: number, decision: DuplicateDecision) => void;
  editingRow: number | null;
  onToggleEdit: (rowIndex: number | null) => void;
  edits: Record<number, Record<string, string | undefined>>;
  onEdit: (rowIndex: number, field: string, value: string) => void;
  onResetRow: (rowIndex: number) => void;
}) {
  const [onlyProblems, setOnlyProblems] = useState(false);
  const columns = config.fields.filter((field) => mappedKeys.includes(field.key));

  const needsAttention = rows.filter(
    (row) => row.status === "error" || duplicates.has(row.index),
  );

  // Without this filter a problem on row 200 of a 500-row file could never be
  // reached, since only the first 20 rows are ever rendered.
  //
  // A row stays visible while it is being edited, and after it has been fixed,
  // even though it no longer qualifies — otherwise it would disappear from
  // under the cursor the moment the last error was corrected, taking the open
  // editor with it and leaving no confirmation that the fix worked.
  const source = onlyProblems
    ? rows.filter(
        (row) =>
          row.status === "error" ||
          duplicates.has(row.index) ||
          editingRow === row.index ||
          Object.keys(edits[row.index] ?? {}).length > 0,
      )
    : rows;
  const visible = source.slice(0, PREVIEW_LIMIT);
  const editingRowData = rows.find((row) => row.index === editingRow) ?? null;

  return (
    // min-w-0 on both: the dialog is a CSS grid, whose items default to
    // min-width:auto. Without this the wide table stretches the grid column
    // past the dialog and drags the footer buttons off-screen with it.
    <div className="min-w-0 space-y-3">
      {needsAttention.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant={onlyProblems ? "secondary" : "outline"}
            size="sm"
            aria-pressed={onlyProblems}
            onClick={() => setOnlyProblems((current) => !current)}
          >
            <Filter className="size-3.5" aria-hidden />
            {onlyProblems ? "Showing rows needing attention" : "Show only rows needing attention"}
            <span className="tabular-nums text-muted-foreground">({needsAttention.length})</span>
          </Button>
          <p className="text-xs text-muted-foreground">
            Fix a row here and it imports with the rest — your file is left untouched.
          </p>
        </div>
      ) : null}
      <div className="max-h-[38vh] min-w-0 overflow-auto rounded-lg border">
        <Table>
          <TableHeader className="sticky top-0 bg-background">
            <TableRow>
              <TableHead className="w-10">
                <span className="sr-only">Row status</span>
              </TableHead>
              <TableHead className="w-12">Row</TableHead>
              <TableHead className="w-20">
                <span className="sr-only">Fix row</span>
              </TableHead>
              {columns.map((field) => (
                <TableHead key={field.key} className="whitespace-nowrap">
                  {field.label}
                </TableHead>
              ))}
              <TableHead className="min-w-[16rem]">Notes</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {visible.map((row) => {
              const duplicate = duplicates.get(row.index);
              const isEditing = editingRow === row.index;
              return (
                <TableRow
                  key={row.index}
                  className={cn(
                    row.status === "error" && "bg-destructive/5",
                    row.status === "warning" && "bg-amber-50 dark:bg-amber-950/20",
                  )}
                >
                  <TableCell>
                    <StatusIcon row={row} />
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{row.index}</TableCell>

                  <TableCell>
                    {/* A toggle, not a second "done" button: the editor below
                        owns finishing, so only one control carries that name. */}
                    <Button
                      variant={
                        isEditing ? "secondary" : row.status === "error" ? "outline" : "ghost"
                      }
                      size="xs"
                      aria-label={`Edit row ${row.index}`}
                      aria-pressed={isEditing}
                      onClick={() => onToggleEdit(isEditing ? null : row.index)}
                    >
                      <Pencil className="size-3.5" aria-hidden />
                      {isEditing ? "Editing" : row.status === "error" ? "Fix" : "Edit"}
                    </Button>
                  </TableCell>

                  {columns.map((field) => (
                    <TableCell key={field.key} className="max-w-[16ch] truncate">
                      {row.mapped[field.key] ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>
                  ))}

                  <TableCell className="space-y-1 text-xs">
                    {row.errors.map((issue, i) => (
                      <p key={`e${i}`} className="text-destructive">
                        {issue.field ? `${issue.field}: ` : ""}
                        {issue.message}
                      </p>
                    ))}
                    {row.warnings.map((issue, i) => (
                      <p key={`w${i}`} className="text-amber-700 dark:text-amber-500">
                        {issue.message}
                      </p>
                    ))}

                    {duplicate ? (
                      <div className="flex items-center gap-2 pt-1">
                        <span className="text-muted-foreground">
                          Matches {duplicate.existingLabel} on {duplicate.matchedOn}
                        </span>
                        <Select
                          value={decisions[row.index] ?? "skip"}
                          onValueChange={(value) =>
                            onDecision(row.index, String(value) as DuplicateDecision)
                          }
                        >
                          <SelectTrigger
                            size="sm"
                            aria-label={`What to do with duplicate row ${row.index}`}
                            className="h-7 w-[11rem]"
                          >
                            <SelectValue>
                              {(value) => DECISION_LABELS[value as DuplicateDecision]}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {(Object.keys(DECISION_LABELS) as DuplicateDecision[]).map((key) => (
                              <SelectItem
                                key={key}
                                value={key}
                                // Updating a row matched only against another
                                // row in this file has nothing to update.
                                disabled={key === "update" && duplicate.existingId === ""}
                              >
                                {DECISION_LABELS[key]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}

                    {row.status === "valid" && !duplicate ? (
                      <span className="text-muted-foreground">Ready to import</span>
                    ) : null}
                  </TableCell>

                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {source.length > PREVIEW_LIMIT ? (
        <p className="text-xs text-muted-foreground">
          Showing the first {PREVIEW_LIMIT} of {source.length}
          {onlyProblems ? " rows needing attention" : " rows"}. Every row was checked — the summary
          below covers all {rows.length}.
        </p>
      ) : null}

      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          Nothing needs attention — every row is ready to import.
        </p>
      ) : null}

      {editingRowData ? (
        <RowEditor
          row={editingRowData}
          columns={columns}
          edits={edits[editingRowData.index] ?? {}}
          onEdit={(field, value) => onEdit(editingRowData.index, field, value)}
          onReset={() => onResetRow(editingRowData.index)}
          onClose={() => onToggleEdit(null)}
        />
      ) : null}
    </div>
  );
}
