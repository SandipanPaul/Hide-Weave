"use client";

import { Plus, X } from "lucide-react";
import { FieldMessages, messageIds } from "@/components/form/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * A list of one-line values that grows and shrinks — phone numbers, email
 * addresses. Each row is a real input sharing one field name, so the server
 * action reads them with `formData.getAll(name)`.
 *
 * Pasting several values into a single row is fine: the schema splits on the
 * usual delimiters, so "a@x.com/b@x.com" becomes two contacts on save.
 */
export function RepeatableField({
  name,
  label,
  values,
  onChange,
  type = "text",
  placeholder,
  hint,
  error,
  addLabel,
}: {
  name: string;
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  type?: string;
  placeholder?: string;
  hint?: string;
  error?: string;
  addLabel: string;
}) {
  // Always render at least one input, so there is somewhere to type.
  const rows = values.length > 0 ? values : [""];
  const { describedBy } = messageIds(name, error, hint);

  const update = (index: number, value: string) => {
    const next = [...rows];
    next[index] = value;
    onChange(next);
  };

  const remove = (index: number) => {
    const next = rows.filter((_, i) => i !== index);
    onChange(next.length > 0 ? next : [""]);
  };

  return (
    <div className="space-y-1.5">
      <Label htmlFor={`${name}-0`}>{label}</Label>

      <div className="space-y-2">
        {rows.map((value, index) => (
          <div key={index} className="flex items-center gap-1.5">
            <Input
              id={`${name}-${index}`}
              name={name}
              type={type}
              value={value}
              placeholder={index === 0 ? placeholder : undefined}
              aria-label={index === 0 ? undefined : `${label} ${index + 1}`}
              aria-invalid={error ? true : undefined}
              aria-describedby={describedBy}
              onChange={(event) => update(index, event.target.value)}
            />
            {rows.length > 1 ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${label.toLowerCase()} ${index + 1}`}
                onClick={() => remove(index)}
              >
                <X className="size-4" aria-hidden />
              </Button>
            ) : null}
          </div>
        ))}
      </div>

      <Button
        type="button"
        variant="ghost"
        size="xs"
        className="text-muted-foreground"
        onClick={() => onChange([...rows, ""])}
      >
        <Plus className="size-3.5" aria-hidden />
        {addLabel}
      </Button>

      <FieldMessages id={name} error={error} hint={hint} />
    </div>
  );
}
