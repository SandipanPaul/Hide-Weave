"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { CheckboxGroup } from "@/components/form/checkbox-group";
import { TextAreaField, TextField } from "@/components/form/fields";
import { FormActions, FormFields } from "@/components/form/form-shell";
import { FormErrors } from "@/components/form/form-errors";
import { useEntityForm, type EntityFormAction } from "@/components/form/use-entity-form";
import {
  SUPPLIER_TYPES,
  SUPPLIER_TYPE_HINTS,
  SUPPLIER_TYPE_LABELS,
  type SupplierType,
} from "@/lib/enums";
import { supplierInputSchema } from "@/lib/schemas";

export type SupplierFormValues = {
  companyName: string;
  types: SupplierType[];
  website: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  sourceUrl: string;
  notes: string;
};

export const EMPTY_SUPPLIER: SupplierFormValues = {
  companyName: "",
  types: [],
  website: "",
  contactPerson: "",
  email: "",
  phone: "",
  address: "",
  sourceUrl: "",
  notes: "",
};

export type SupplierField = keyof SupplierFormValues;

const TYPE_OPTIONS = SUPPLIER_TYPES.map((type) => ({
  value: type,
  label: SUPPLIER_TYPE_LABELS[type],
  hint: SUPPLIER_TYPE_HINTS[type],
}));

/** Marks a value the app guessed rather than one the user typed. */
function AutoFilled() {
  return (
    <span className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
      <Sparkles className="size-2.5" aria-hidden />
      auto-filled
    </span>
  );
}

/**
 * Shared by the add dialog and the inline edit panel.
 *
 * Fields pre-filled by website extraction are marked as such, and the mark
 * clears the moment you edit that field — an extracted value is a suggestion
 * to check, never a fact.
 */
export function SupplierForm({
  action,
  initialValues = EMPTY_SUPPLIER,
  autoFilled,
  submitLabel,
  successMessage,
  onSuccess,
  onCancel,
  scrollable = false,
}: {
  action: EntityFormAction;
  initialValues?: SupplierFormValues;
  /** Fields whose values came from extraction rather than from the user. */
  autoFilled?: ReadonlyArray<SupplierField>;
  submitLabel: string;
  successMessage: string;
  onSuccess?: (id: string) => void;
  onCancel?: () => void;
  scrollable?: boolean;
}) {
  const { formAction, values, setField, errorFor, serverErrors } = useEntityForm({
    action,
    schema: supplierInputSchema,
    initialValues,
    successMessage,
    onSuccess,
  });
  const [guessed, setGuessed] = useState<Set<string>>(new Set(autoFilled ?? []));

  const set = (field: SupplierField) => (value: string) => {
    setField(field)(value);
    // Editing a suggestion makes it yours.
    setGuessed((current) => {
      if (!current.has(field)) return current;
      const next = new Set(current);
      next.delete(field);
      return next;
    });
  };

  const markFor = (field: SupplierField) => (guessed.has(field) ? <AutoFilled /> : undefined);

  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col gap-4" noValidate>
      <FormErrors errors={serverErrors?.formErrors ?? []} />

      {/* Where the values came from, kept out of sight but sent with the form. */}
      <input type="hidden" name="sourceUrl" value={values.sourceUrl} />

      <FormFields scrollable={scrollable}>
        <TextField
          label="Company name"
          name="companyName"
          required
          autoFocus
          value={values.companyName}
          onValueChange={set("companyName")}
          error={errorFor("companyName")}
          annotation={markFor("companyName")}
        />

        <CheckboxGroup
          name="types"
          label="What they do"
          options={TYPE_OPTIONS}
          values={values.types}
          onChange={(types) => setField("types")(types)}
          error={errorFor("types")}
          hint="Several can be true — a tannery that also exports is common."
        />

        <div className="grid gap-4 @lg:grid-cols-2">
          <TextField
            label="Website"
            name="website"
            placeholder="example.com"
            hint="A bare domain is fine."
            value={values.website}
            onValueChange={set("website")}
            error={errorFor("website")}
            annotation={markFor("website")}
          />

          <TextField
            label="Contact person"
            name="contactPerson"
            value={values.contactPerson}
            onValueChange={set("contactPerson")}
            error={errorFor("contactPerson")}
            annotation={markFor("contactPerson")}
          />
        </div>

        <div className="grid gap-4 @lg:grid-cols-2">
          <TextField
            label="Email"
            name="email"
            type="email"
            value={values.email}
            onValueChange={set("email")}
            error={errorFor("email")}
            annotation={markFor("email")}
          />

          <TextField
            label="Phone"
            name="phone"
            type="tel"
            value={values.phone}
            onValueChange={set("phone")}
            error={errorFor("phone")}
            annotation={markFor("phone")}
          />
        </div>

        <TextAreaField
          label="Address"
          name="address"
          rows={3}
          value={values.address}
          onValueChange={set("address")}
          error={errorFor("address")}
          annotation={markFor("address")}
        />

        <TextAreaField
          label="Notes"
          name="notes"
          rows={2}
          value={values.notes}
          onValueChange={set("notes")}
          error={errorFor("notes")}
          annotation={markFor("notes")}
        />
      </FormFields>

      <FormActions submitLabel={submitLabel} onCancel={onCancel} />
    </form>
  );
}
