"use client";

import { Plus, X } from "lucide-react";
import { Field } from "@/components/form/field";
import { SelectField, TextAreaField, TextField } from "@/components/form/fields";
import { FormActions, FormFields } from "@/components/form/form-shell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FormErrors } from "@/components/form/form-errors";
import { useEntityForm, type EntityFormAction } from "@/components/form/use-entity-form";
import {
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
} from "@/lib/enums";
import {
  COMMON_CURRENCIES,
  computeCommission,
  formatMoney,
  MoneyError,
  parseMoneyToMinor,
} from "@/lib/money";
import { projectInputSchema } from "@/lib/schemas";

/** One row of the split: who is making it, and how much. */
export type SupplierRow = { supplierId: string; quantity: string };

export type ProjectFormValues = {
  clientId: string;
  suppliers: SupplierRow[];
  product: string;
  orderId: string;
  clientReference: string;
  quantity: string;
  unit: string;
  orderValue: string;
  commissionPercentage: string;
  currency: string;
  status: string;
  orderDate: string;
  expectedDelivery: string;
  actualDelivery: string;
  notes: string;
};

export type ProjectFormOptions = {
  clients: Array<{ id: string; name: string; currency: string }>;
  suppliers: Array<{ id: string; companyName: string }>;
};

function emptyProject(): ProjectFormValues {
  return {
    clientId: "",
    suppliers: [],
    product: "",
    orderId: "",
    clientReference: "",
    quantity: "",
    unit: "pcs",
    orderValue: "",
    commissionPercentage: "",
    currency: "INR",
    status: "QUOTED",
    // Today, as a calendar day — the overwhelmingly common case.
    orderDate: new Date().toISOString().slice(0, 10),
    expectedDelivery: "",
    actualDelivery: "",
    notes: "",
  };
}

const STATUS_OPTIONS = PROJECT_STATUSES.map((status) => ({
  value: status,
  label: PROJECT_STATUS_LABELS[status],
}));

const CURRENCY_OPTIONS = COMMON_CURRENCIES.map((currency) => ({
  value: currency,
  label: currency,
}));

/**
 * The commission this order would earn, as typed. Returns a message instead of
 * a figure while the inputs are incomplete or malformed, so the panel always
 * says something rather than flickering between a number and nothing.
 */
function previewCommission(
  orderValue: string,
  percentage: string,
  currency: string,
): { amount: bigint; note: string } | { amount: null; note: string } {
  if (!orderValue.trim() || !percentage.trim()) {
    return { amount: null, note: "Enter an order value and a commission % to see the amount." };
  }
  const percent = Number(percentage);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    return { amount: null, note: "Commission % must be between 0 and 100." };
  }
  try {
    const minor = parseMoneyToMinor(orderValue, currency);
    return { amount: computeCommission(minor, percent), note: "" };
  } catch (error) {
    return {
      amount: null,
      note: error instanceof MoneyError ? error.message : "Enter a valid order value.",
    };
  }
}

/**
 * Shared by the add dialog and the inline edit panel.
 *
 * The commission is shown live as the order value and percentage are typed —
 * computed by the same `computeCommission` the server and every table use, so
 * what you sanity-check here is exactly what gets saved.
 */
export function ProjectForm({
  action,
  options,
  initialValues,
  submitLabel,
  successMessage,
  onSuccess,
  onCancel,
  scrollable = false,
}: {
  action: EntityFormAction;
  options: ProjectFormOptions;
  initialValues?: ProjectFormValues;
  submitLabel: string;
  successMessage: string;
  onSuccess?: (id: string) => void;
  onCancel?: () => void;
  scrollable?: boolean;
}) {
  const { formAction, values, setValues, setField, touched, errorFor, serverErrors } =
    useEntityForm({
      action,
      schema: projectInputSchema,
      initialValues: initialValues ?? emptyProject(),
      successMessage,
      onSuccess,
    });

  const set = setField;

  /**
   * Picking a client suggests their usual currency, until the currency is
   * chosen deliberately — most of a client's orders are billed the same way.
   */
  const setClient = (clientId: string) => {
    const client = options.clients.find((candidate) => candidate.id === clientId);
    setValues((current) => ({
      ...current,
      clientId,
      currency: touched.currency ? current.currency : (client?.currency ?? current.currency),
    }));
    setField("clientId")(clientId);
  };

  const preview = previewCommission(values.orderValue, values.commissionPercentage, values.currency);

  const clientOptions = [
    { value: "", label: "Choose a client…" },
    ...options.clients.map((client) => ({ value: client.id, label: client.name })),
  ];

  const supplierOptions = [
    { value: "", label: "Choose a supplier…" },
    ...options.suppliers.map((supplier) => ({
      value: supplier.id,
      label: supplier.companyName,
    })),
  ];

  // Always show one row to type into, the way the contact fields do.
  const supplierRows: SupplierRow[] =
    values.suppliers.length > 0 ? values.suppliers : [{ supplierId: "", quantity: "" }];

  const setSuppliers = (rows: SupplierRow[]) => setValues((c) => ({ ...c, suppliers: rows }));

  const updateRow = (index: number, patch: Partial<SupplierRow>) =>
    setSuppliers(supplierRows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const assigned = supplierRows.reduce((total, row) => total + (Number(row.quantity) || 0), 0);
  const ordered = Number(values.quantity) || 0;
  const remaining = ordered - assigned;

  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col gap-4" noValidate>
      <FormErrors errors={serverErrors?.formErrors ?? []} />

      <FormFields scrollable={scrollable}>
        <SelectField
          label="Client"
          name="clientId"
          required
          options={clientOptions}
          value={values.clientId}
          onValueChange={setClient}
          error={errorFor("clientId")}
        />

        <div className="grid gap-4 @lg:grid-cols-2">
          <TextField
            label="Product"
            name="product"
            required
            placeholder="Basmati rice, 1121 steam"
            value={values.product}
            onValueChange={set("product")}
            error={errorFor("product")}
          />

          {/* Issued by the app, never typed — so it is shown rather than
              edited. On a new order there is nothing to show yet, because the
              number is only taken when the order is actually written. */}
          <Field label="Order ID" hint="Issued automatically — your reference for this consignment.">
            {(props) => (
              <p
                {...props}
                className="flex h-8 items-center font-mono text-sm text-muted-foreground"
              >
                {values.orderId || "Assigned when you save"}
              </p>
            )}
          </Field>
        </div>

        <TextField
          label="Client reference"
          name="clientReference"
          hint="Their PO number, if they gave you one — searchable, in whatever format they use."
          placeholder="4500123"
          value={values.clientReference}
          onValueChange={set("clientReference")}
          error={errorFor("clientReference")}
        />

        <div className="grid gap-4 @lg:grid-cols-[minmax(0,1fr)_8rem]">
          <TextField
            label="Quantity"
            name="quantity"
            required
            inputMode="numeric"
            placeholder="1000"
            value={values.quantity}
            onValueChange={set("quantity")}
            error={errorFor("quantity")}
          />

          <TextField
            label="Unit"
            name="unit"
            placeholder="pcs"
            value={values.unit}
            onValueChange={set("unit")}
            error={errorFor("unit")}
          />
        </div>

        <div className="grid gap-4 @lg:grid-cols-[minmax(0,1fr)_7rem] @2xl:grid-cols-[minmax(0,1fr)_7rem_9rem]">
          <TextField
            label="Order value"
            name="orderValue"
            required
            inputMode="decimal"
            placeholder="0.00"
            hint="The consignment total, not your commission."
            value={values.orderValue}
            onValueChange={set("orderValue")}
            error={errorFor("orderValue")}
          />

          <SelectField
            label="Currency"
            name="currency"
            options={CURRENCY_OPTIONS}
            value={values.currency}
            onValueChange={set("currency")}
            error={errorFor("currency")}
          />

          <TextField
            label="Commission %"
            name="commissionPercentage"
            required
            inputMode="decimal"
            placeholder="2.5"
            value={values.commissionPercentage}
            onValueChange={set("commissionPercentage")}
            error={errorFor("commissionPercentage")}
          />
        </div>

        {/* Who is making it. A large order is often shared between several
            suppliers, so this is a list rather than a single choice, and it
            adds up against the quantity above. */}
        <fieldset className="space-y-2 rounded-lg border p-3">
          <legend className="px-1 text-sm font-medium">
            Suppliers
            <span className="ml-1.5 font-normal text-muted-foreground">
              optional — who is making this order
            </span>
          </legend>

          {supplierRows.map((row, index) => (
            <div
              key={index}
              className="grid grid-cols-[minmax(0,1fr)_8rem_2rem] items-start gap-2"
            >
              <SelectField
                className="min-w-0"
                label={index === 0 ? "Supplier" : `Supplier ${index + 1}`}
                name="supplierId"
                options={supplierOptions}
                value={row.supplierId}
                onValueChange={(value) => updateRow(index, { supplierId: value })}
              />
              <TextField
                className="min-w-0"
                label={index === 0 ? "Share" : `Share ${index + 1}`}
                name="supplierQuantity"
                inputMode="numeric"
                placeholder="0"
                value={row.quantity}
                onValueChange={(value) => updateRow(index, { quantity: value })}
              />
              {/* The spacer stands in for the label the other two cells have,
                  so the button lines up with the controls, not with their
                  labels. The cell is always present so rows keep the same
                  widths whether or not they can be removed. */}
              <div className="space-y-1.5">
                <Label aria-hidden className="invisible select-none">
                  Remove
                </Label>
                {supplierRows.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="mt-0.5"
                    aria-label={`Remove supplier ${index + 1}`}
                    onClick={() => setSuppliers(supplierRows.filter((_, i) => i !== index))}
                  >
                    <X className="size-4" aria-hidden />
                  </Button>
                ) : null}
              </div>
            </div>
          ))}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="text-muted-foreground"
              onClick={() => setSuppliers([...supplierRows, { supplierId: "", quantity: "" }])}
            >
              <Plus className="size-3.5" aria-hidden />
              Add another supplier
            </Button>

            {/* The running total, so a split that does not add up is obvious
                while you are typing rather than on submit. */}
            {ordered > 0 && assigned > 0 ? (
              <p
                className={`text-xs tabular-nums ${
                  remaining < 0 ? "font-medium text-destructive" : "text-muted-foreground"
                }`}
                aria-live="polite"
              >
                {remaining < 0
                  ? `${Math.abs(remaining).toLocaleString("en-IN")} ${values.unit} over the order's ${ordered.toLocaleString("en-IN")}`
                  : remaining === 0
                    ? `All ${ordered.toLocaleString("en-IN")} ${values.unit} assigned`
                    : `${remaining.toLocaleString("en-IN")} ${values.unit} not yet assigned`}
              </p>
            ) : null}
          </div>

          {errorFor("suppliers") ? (
            <p className="text-xs font-medium text-destructive">{errorFor("suppliers")}</p>
          ) : null}
        </fieldset>

        {/* The figure this whole record exists to produce, shown before saving
            rather than discovered afterwards. */}
        <div
          className="rounded-lg border bg-muted/40 px-4 py-3"
          aria-live="polite"
          data-testid="commission-preview"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Commission on this order
          </p>
          {preview.amount === null ? (
            <p className="mt-1 text-sm text-muted-foreground">{preview.note}</p>
          ) : (
            <p className="mt-0.5 text-2xl font-semibold tabular-nums">
              {formatMoney(preview.amount, values.currency)}
            </p>
          )}
        </div>

        <div className="grid gap-4 @lg:grid-cols-2">
          <SelectField
            label="Status"
            name="status"
            options={STATUS_OPTIONS}
            value={values.status}
            onValueChange={(value) => set("status")(value || "QUOTED")}
            error={errorFor("status")}
          />

          <TextField
            label="Order date"
            name="orderDate"
            type="date"
            required
            value={values.orderDate}
            onValueChange={set("orderDate")}
            error={errorFor("orderDate")}
          />
        </div>

        <div className="grid gap-4 @lg:grid-cols-2">
          <TextField
            label="Expected delivery"
            name="expectedDelivery"
            type="date"
            hint="Optional"
            value={values.expectedDelivery}
            onValueChange={set("expectedDelivery")}
            error={errorFor("expectedDelivery")}
          />

          <TextField
            label="Actual delivery"
            name="actualDelivery"
            type="date"
            hint="Optional — fill in once it lands."
            value={values.actualDelivery}
            onValueChange={set("actualDelivery")}
            error={errorFor("actualDelivery")}
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
