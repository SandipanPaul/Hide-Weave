"use client";

import { SelectField, TextAreaField, TextField } from "@/components/form/fields";
import { RepeatableField } from "@/components/form/repeatable-field";
import { FormActions, FormFields } from "@/components/form/form-shell";
import { FormErrors } from "@/components/form/form-errors";
import { useEntityForm, type EntityFormAction } from "@/components/form/use-entity-form";
import { COUNTRY_OPTIONS } from "@/lib/countries";
import { CLIENT_STATUSES, CLIENT_STATUS_LABELS } from "@/lib/enums";
import { COMMON_CURRENCIES } from "@/lib/money";
import { clientInputSchema } from "@/lib/schemas";

export type ClientFormValues = {
  name: string;
  address: string;
  country: string;
  phones: string[];
  emails: string[];
  website: string;
  contactPerson: string;
  status: string;
  fixedMonthly: string;
  currency: string;
  notes: string;
};

const EMPTY_CLIENT: ClientFormValues = {
  name: "",
  address: "",
  country: "",
  phones: [],
  emails: [],
  website: "",
  contactPerson: "",
  status: "ACTIVE",
  fixedMonthly: "",
  currency: "INR",
  notes: "",
};

const STATUS_OPTIONS = CLIENT_STATUSES.map((status) => ({
  value: status,
  label: CLIENT_STATUS_LABELS[status],
}));

const CURRENCY_OPTIONS = COMMON_CURRENCIES.map((currency) => ({
  value: currency,
  label: currency,
}));

/**
 * Shared by the add modal and the inline edit panel.
 *
 * Validation runs twice on purpose: live in the browser against the same Zod
 * schema the server uses, so mistakes surface as you go; and again in the
 * server action, which is the only one that decides anything.
 */
export function ClientForm({
  action,
  initialValues = EMPTY_CLIENT,
  submitLabel,
  onSuccess,
  onCancel,
  successMessage,
  scrollable = false,
}: {
  action: EntityFormAction;
  initialValues?: ClientFormValues;
  submitLabel: string;
  onSuccess?: (id: string) => void;
  onCancel?: () => void;
  successMessage: string;
  /** In a modal, cap the field area so the buttons stay on screen. */
  scrollable?: boolean;
}) {
  const {
    formAction,
    values,
    setValues,
    setField,
    touched,
    markTouched,
    errorFor,
    serverErrors,
    clientErrors,
  } = useEntityForm({
    action,
    schema: clientInputSchema,
    initialValues,
    successMessage,
    onSuccess,
  });

  const set = setField;

  const setList = (field: "phones" | "emails") => (value: string[]) => {
    setValues((current) => ({ ...current, [field]: value }));
    // Adding or removing a blank row is not "engaging with the field" — only
    // typing something is. Otherwise clicking "Add another address" would
    // immediately scold you for an empty form.
    if (value.some((entry) => entry.trim() !== "")) markTouched(field);
  };

  // The phone-or-email rule belongs to the pair, so it waits until one of the
  // two has actually been typed in. Filling only the name and cancelling
  // should not raise it; submitting will, because the server says so.
  const showFormErrors = touched.phones || touched.emails;
  const formErrors = [
    ...(serverErrors?.formErrors ?? []),
    ...(showFormErrors ? clientErrors.formErrors : []),
  ];

  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col gap-4" noValidate>
      <FormErrors errors={formErrors} />

      <FormFields scrollable={scrollable}>
        <TextField
          label="Name"
          name="name"
          required
          autoFocus
          value={values.name}
          onValueChange={set("name")}
          error={errorFor("name")}
        />

        <div className="grid gap-4 @lg:grid-cols-2">
          <RepeatableField
            name="phone"
            label="Phone"
            addLabel="Add another number"
            type="tel"
            values={values.phones}
            onChange={setList("phones")}
            error={errorFor("phones")}
            hint="Phone or email — at least one is needed."
          />

          <RepeatableField
            name="email"
            label="Email"
            addLabel="Add another address"
            type="email"
            values={values.emails}
            onChange={setList("emails")}
            error={errorFor("emails")}
            hint="Several at once is fine — separate them with / or ;"
          />
        </div>

        <div className="grid gap-4 @lg:grid-cols-2">
          <TextField
            label="Contact person"
            name="contactPerson"
            value={values.contactPerson}
            onValueChange={set("contactPerson")}
            error={errorFor("contactPerson")}
          />

          <TextField
            label="Website"
            name="website"
            type="url"
            placeholder="https://example.com"
            hint="Include https://"
            value={values.website}
            onValueChange={set("website")}
            error={errorFor("website")}
          />
        </div>

        <div className="grid gap-4 @xl:grid-cols-[minmax(0,1fr)_14rem]">
          <TextAreaField
            label="Address"
            name="address"
            rows={3}
            value={values.address}
            onValueChange={set("address")}
            error={errorFor("address")}
          />

          {/* A datalist keeps this a plain text input — typeable,
              keyboard-navigable, and tolerant of "UK" or "USA" — while still
              offering the full list. */}
          <TextField
            label="Country"
            name="country"
            list="country-options"
            autoComplete="country-name"
            placeholder="India"
            hint="Start typing, or use a 2-letter code."
            value={values.country}
            onValueChange={set("country")}
            error={errorFor("country")}
            after={
              <datalist id="country-options">
                {COUNTRY_OPTIONS.map((country) => (
                  <option key={country.code} value={country.name} />
                ))}
              </datalist>
            }
          />
        </div>

        <div className="grid gap-4 @lg:grid-cols-2 @xl:grid-cols-3">
          <SelectField
            label="Status"
            name="status"
            options={STATUS_OPTIONS}
            value={values.status}
            onValueChange={(value) => set("status")(value || "ACTIVE")}
            error={errorFor("status")}
          />

          <TextField
            label="Monthly retainer"
            name="fixedMonthly"
            inputMode="decimal"
            placeholder="0.00"
            hint="Optional, separate from commission."
            value={values.fixedMonthly}
            onValueChange={set("fixedMonthly")}
            error={errorFor("fixedMonthly")}
          />

          <SelectField
            label="Retainer currency"
            name="currency"
            options={CURRENCY_OPTIONS}
            value={values.currency}
            onValueChange={(value) => set("currency")(value || "INR")}
            error={errorFor("currency")}
          />
        </div>

        <TextAreaField
          label="Notes"
          name="notes"
          rows={2}
          value={values.notes}
          onValueChange={set("notes")}
          error={errorFor("notes")}
        />

      </FormFields>

      <FormActions submitLabel={submitLabel} onCancel={onCancel} />
    </form>
  );
}
