"use client";

import { AlertCircle, ArrowRight } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { missingRequiredFields } from "@/lib/csv/mapping";
import type { ImportConfig } from "@/lib/csv/types";

const IGNORE = "__ignore__";

/**
 * The file's headers on the left, the fields they map to on the right.
 * Every guess is overridable, and anything left unmapped is simply ignored.
 */
export function MappingStep({
  config,
  headers,
  mapping,
  sampleRow,
  onChange,
}: {
  config: ImportConfig;
  headers: string[];
  mapping: Record<string, string | null>;
  sampleRow: Record<string, string> | undefined;
  onChange: (header: string, field: string | null) => void;
}) {
  const missing = missingRequiredFields(mapping, config.fields);
  // A field already spoken for by another column can't be picked twice.
  const claimed = new Map<string, string>();
  for (const [header, field] of Object.entries(mapping)) {
    if (field) claimed.set(field, header);
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
      {missing.length > 0 ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Map a column to {missing.map((field) => field.label).join(" and ")} before continuing.
          </span>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {headers.map((header) => {
          const value = mapping[header];
          const sample = sampleRow?.[header];

          return (
            <div
              key={header}
              className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,14rem)] items-center gap-3 rounded-lg border px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{header}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {sample ? `e.g. ${sample}` : "no value in the first row"}
                </p>
              </div>

              <ArrowRight className="size-4 text-muted-foreground" aria-hidden />

              <Select
                value={value ?? IGNORE}
                onValueChange={(next) =>
                  onChange(header, next === IGNORE ? null : String(next))
                }
              >
                <SelectTrigger aria-label={`Map column ${header}`}>
                  <SelectValue>
                    {(selected) =>
                      selected === IGNORE
                        ? "Ignore this column"
                        : (config.fields.find((f) => f.key === selected)?.label ??
                          String(selected))
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={IGNORE}>Ignore this column</SelectItem>
                  {config.fields.map((field) => {
                    const takenBy = claimed.get(field.key);
                    const disabled = takenBy !== undefined && takenBy !== header;
                    return (
                      <SelectItem key={field.key} value={field.key} disabled={disabled}>
                        {field.label}
                        {field.required ? " *" : ""}
                        {disabled ? ` — already mapped` : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          );
        })}
      </div>
    </div>
  );
}
