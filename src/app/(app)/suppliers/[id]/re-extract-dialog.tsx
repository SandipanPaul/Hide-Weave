"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Loader2, RefreshCw } from "lucide-react";
import { applyExtractedFields, extractSupplier } from "../extraction-actions";
import { ErrorNote } from "@/components/form/error-note";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

/** The fields a re-read can change. Notes are included; the website is not. */
const COMPARED = [
  { key: "companyName", label: "Company name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "address", label: "Address" },
  { key: "notes", label: "Notes" },
] as const;

type Row = { key: string; label: string; before: string; after: string; from: string };

/**
 * Reads the supplier's website again and shows what changed, field by field,
 * before anything is written.
 *
 * Re-extraction never overwrites silently: each difference is accepted or
 * left alone individually, because a site redesign is far more likely to make
 * a value worse than better.
 */
export function ReExtractDialog({
  supplierId,
  url,
  current,
}: {
  supplierId: string;
  /** Where to read: the URL it was extracted from, or its website. */
  url: string;
  current: Record<string, string>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [readFrom, setReadFrom] = useState<string | null>(null);
  const [isPending, startWork] = useTransition();

  const reset = () => {
    setRows(null);
    setAccepted(new Set());
    setError(null);
    setReadFrom(null);
  };

  const read = () => {
    reset();
    startWork(async () => {
      const result = await extractSupplier(url);
      if (!result.ok) {
        setError(result.message);
        return;
      }

      const sourceOf = new Map(result.picked.map((item) => [item.field, item.from]));
      const differences: Row[] = [];
      for (const field of COMPARED) {
        const after = result.values[field.key] ?? "";
        const before = current[field.key] ?? "";
        // Only differences, and never a blank replacing something we have:
        // the site dropping a phone number is not a reason to lose ours.
        if (after.trim() === "" || after.trim() === before.trim()) continue;
        differences.push({
          key: field.key,
          label: field.label,
          before,
          after,
          from: sourceOf.get(field.key) ?? "the page",
        });
      }

      setRows(differences);
      setReadFrom(new URL(result.finalUrl).hostname);
      // Nothing is pre-accepted — the point of the diff is to choose.
      setAccepted(new Set());
    });
  };

  const apply = () => {
    if (!rows) return;
    const values: Record<string, string> = {};
    for (const row of rows) {
      if (accepted.has(row.key)) values[row.key] = row.after;
    }

    startWork(async () => {
      const result = await applyExtractedFields(supplierId, values);
      if (result.ok) {
        toast.success(
          `Updated ${Object.keys(values).length} field${
            Object.keys(values).length === 1 ? "" : "s"
          }.`,
        );
        setOpen(false);
        reset();
        router.refresh();
      } else {
        setError(
          result.formErrors[0] ??
            Object.values(result.fieldErrors)[0]?.[0] ??
            "Could not save those changes.",
        );
      }
    });
  };

  const toggle = (key: string) =>
    setAccepted((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) read();
        else reset();
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <RefreshCw className="size-4" aria-hidden />
        Re-read site
      </DialogTrigger>

      <DialogContent className="min-w-0 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Re-read {new URL(url).hostname}</DialogTitle>
          <DialogDescription>
            Nothing changes until you pick what to accept.
          </DialogDescription>
        </DialogHeader>

        <div className="min-w-0 space-y-4">
          {isPending && rows === null ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Reading the site…
            </p>
          ) : null}

          {error ? <ErrorNote>{error}</ErrorNote> : null}

          {rows !== null && rows.length === 0 && !error ? (
            <p className="flex items-start gap-2 rounded-md border px-3 py-2 text-sm">
              <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
              Nothing has changed on {readFrom} — what you have already matches the site.
            </p>
          ) : null}

          {rows !== null && rows.length > 0 ? (
            <>
              <p className="text-sm text-muted-foreground">
                {rows.length} difference{rows.length === 1 ? "" : "s"} on {readFrom}. Tick the ones
                to accept.
              </p>

              <ul className="space-y-3">
                {rows.map((row) => (
                  <li key={row.key} className="@container rounded-lg border p-3">
                    <div className="flex items-start gap-2.5">
                      <Checkbox
                        id={`accept-${row.key}`}
                        checked={accepted.has(row.key)}
                        onCheckedChange={() => toggle(row.key)}
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <Label htmlFor={`accept-${row.key}`} className="font-medium">
                          {row.label}
                          <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                            from {row.from}
                          </span>
                        </Label>

                        <div className="grid gap-1 text-sm @md:grid-cols-2">
                          <div className="min-w-0">
                            <p className="text-xs text-muted-foreground">Now</p>
                            <p className="break-words line-through decoration-muted-foreground/40">
                              {row.before || "—"}
                            </p>
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs text-muted-foreground">On the site</p>
                            <p className="break-words font-medium">{row.after}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          <div className="flex justify-end gap-2 border-t pt-3">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            {rows !== null && rows.length > 0 ? (
              <Button onClick={apply} disabled={accepted.size === 0 || isPending}>
                {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                Accept {accepted.size} change{accepted.size === 1 ? "" : "s"}
              </Button>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
