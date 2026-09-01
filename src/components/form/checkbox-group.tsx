"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { FieldMessages, messageIds } from "@/components/form/field";
import { Label } from "@/components/ui/label";

/**
 * A small set of options where more than one may be true.
 *
 * Each box is a real input sharing one field name, so the server action reads
 * them with `formData.getAll(name)` — the same shape as RepeatableField, and
 * the reason no hidden-field plumbing is needed.
 */
export function CheckboxGroup<T extends string>({
  name,
  label,
  options,
  values,
  onChange,
  hint,
  error,
}: {
  name: string;
  label: string;
  options: readonly { value: T; label: string; hint?: string }[];
  values: readonly T[];
  onChange: (values: T[]) => void;
  hint?: string;
  error?: string;
}) {
  const { describedBy } = messageIds(name, error, hint);

  const toggle = (value: T) =>
    onChange(values.includes(value) ? values.filter((v) => v !== value) : [...values, value]);

  return (
    <div className="group/field space-y-2">
      <Label>{label}</Label>

      <div
        role="group"
        aria-label={label}
        aria-describedby={describedBy}
        className="grid gap-2 @sm:grid-cols-2"
      >
        {options.map((option) => {
          const checked = values.includes(option.value);
          return (
            <label
              key={option.value}
              className="flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 transition-colors hover:bg-muted/60 has-data-checked:border-primary/40 has-data-checked:bg-muted/40"
            >
              <Checkbox
                checked={checked}
                onCheckedChange={() => toggle(option.value)}
                className="mt-0.5"
                aria-label={option.label}
              />
              {/* The real value, so the form submits without extra plumbing. */}
              {checked ? <input type="hidden" name={name} value={option.value} /> : null}
              <span className="min-w-0">
                <span className="block text-sm">{option.label}</span>
                {option.hint ? (
                  <span className="block text-xs text-muted-foreground">{option.hint}</span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>

      <FieldMessages id={name} error={error} hint={hint} />
    </div>
  );
}
