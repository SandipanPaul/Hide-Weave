"use client";

import { Field } from "@/components/form/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

/**
 * The three shapes almost every field in this app takes, each already wired to
 * a controlled value. Anything more unusual uses `Field` directly.
 */

type Common = {
  label: string;
  name: string;
  value: string;
  onValueChange: (value: string) => void;
  error?: string;
  hint?: string;
  required?: boolean;
  /** A small note beside the label, e.g. that a value was auto-filled. */
  annotation?: React.ReactNode;
  className?: string;
};

export function TextField({
  label,
  name,
  value,
  onValueChange,
  error,
  hint,
  required,
  annotation,
  className,
  after,
  ...input
}: Common & {
  /** Rendered alongside the input — a <datalist>, say. */
  after?: React.ReactNode;
} & Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "name">) {
  return (
    <Field
      label={label}
      error={error}
      hint={hint}
      required={required}
      annotation={annotation}
      className={className}
    >
      {(props) => (
        <>
          <Input
            {...props}
            {...input}
            name={name}
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
          />
          {after}
        </>
      )}
    </Field>
  );
}

export function TextAreaField({
  label,
  name,
  value,
  onValueChange,
  error,
  hint,
  required,
  annotation,
  className,
  ...textarea
}: Common & Omit<React.ComponentProps<typeof Textarea>, "value" | "onChange" | "name">) {
  return (
    <Field
      label={label}
      error={error}
      hint={hint}
      required={required}
      annotation={annotation}
      className={className}
    >
      {(props) => (
        <Textarea
          {...props}
          {...textarea}
          name={name}
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
        />
      )}
    </Field>
  );
}

export type SelectOption = { value: string; label: string };

/**
 * A select over a fixed set of options. The trigger shows the option's label:
 * without a render function Base UI shows the raw stored value, so a status of
 * "ACTIVE" would appear in place of "Active".
 */
export function SelectField({
  label,
  name,
  value,
  onValueChange,
  options,
  error,
  hint,
  required,
  annotation,
  className,
}: Common & { options: readonly SelectOption[] }) {
  const labelFor = (raw: unknown) =>
    options.find((option) => option.value === raw)?.label ?? String(raw ?? "");

  return (
    <Field
      label={label}
      error={error}
      hint={hint}
      required={required}
      annotation={annotation}
      className={className}
    >
      {(props) => (
        <Select
          name={name}
          value={value}
          onValueChange={(next) => onValueChange(next === null ? "" : String(next))}
        >
          <SelectTrigger
            id={props.id}
            aria-describedby={props["aria-describedby"]}
            className="w-full"
          >
            <SelectValue>{(raw) => labelFor(raw)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </Field>
  );
}
