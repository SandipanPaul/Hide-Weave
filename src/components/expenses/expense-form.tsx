"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createExpense, updateExpense } from "@/app/(app)/expenses/actions";
import { Field } from "@/components/form/field";
import { SelectField } from "@/components/form/fields";
import { FormErrors } from "@/components/form/form-errors";
import { SubmitButton } from "@/components/form/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS } from "@/lib/enums";
import type { ActionResult } from "@/lib/schemas";

/** Amounts arrive already formatted — the server owns money rendering. */
/** A client the spend can be attributed to. */
export type ClientOption = { id: string; name: string };

export type ExpenseView = {
  id: string;
  incurredOn: string;
  displayDate: string;
  description: string;
  amountDisplay: string;
  /** The same amount as a plain number, for the edit form. */
  amountInput: string;
  category: string;
  categoryLabel: string | null;
  notes: string | null;
  /** Null for a general expense that belongs to no order. */
  projectId: string | null;
  /** Who the spend was for, if anyone. Independent of the order. */
  clientId: string;
};

const CATEGORY_OPTIONS = [
  { value: "", label: "Uncategorised" },
  ...EXPENSE_CATEGORIES.map((category) => ({
    value: category,
    label: EXPENSE_CATEGORY_LABELS[category],
  })),
];

/**
 * Recording or correcting one expense.
 *
 * `projectId` decides what kind of expense this is: given one, the spend
 * belongs to that order and is recorded in its currency; without one it is
 * general overhead recorded in `currency`. An expense cannot be moved between
 * the two after the fact — see updateExpense.
 */
export function ExpenseForm({
  projectId,
  currency,
  expense,
  clients,
  onDone,
}: {
  projectId?: string;
  currency: string;
  /** Present when correcting an existing expense rather than adding one. */
  expense?: ExpenseView;
  /**
   * Offered when the spend can be attributed to someone. Omitted on a
   * project's own page, where the client is already known from the order.
   */
  clients?: readonly ClientOption[];
  onDone: () => void;
}) {
  const router = useRouter();
  const action = expense
    ? updateExpense.bind(null, expense.id)
    : createExpense.bind(null, currency);
  const [state, formAction] = useActionState<ActionResult<{ id: string }> | null, FormData>(
    action,
    null,
  );
  // The only field that needs state: Base UI's Select is controlled, and the
  // rest are plain inputs the form reads on submit.
  const [category, setCategory] = useState(expense?.category ?? "");
  const [clientId, setClientId] = useState(expense?.clientId ?? "");

  const fieldError = (name: string) =>
    state && !state.ok ? state.fieldErrors[name]?.[0] : undefined;

  useEffect(() => {
    if (state?.ok) {
      toast.success(expense ? "Expense updated." : "Expense recorded.");
      onDone();
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction} className="space-y-3 rounded-lg border bg-muted/30 p-4">
      {state && !state.ok ? <FormErrors errors={state.formErrors} /> : null}
      {projectId ? <input type="hidden" name="projectId" value={projectId} /> : null}

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_11rem]">
        <Field label="What it was for" required error={fieldError("description")}>
          {(props) => (
            <Input
              {...props}
              name="description"
              defaultValue={expense?.description ?? ""}
              placeholder="Courier to Chennai"
              autoFocus
            />
          )}
        </Field>

        <Field label={`Amount (${currency})`} required error={fieldError("amount")}>
          {(props) => (
            <Input
              {...props}
              name="amount"
              inputMode="decimal"
              defaultValue={expense?.amountInput ?? ""}
              placeholder="0.00"
            />
          )}
        </Field>

        <Field label="Spent on" required error={fieldError("incurredOn")}>
          {(props) => (
            <Input
              {...props}
              name="incurredOn"
              type="date"
              defaultValue={expense?.incurredOn ?? new Date().toISOString().slice(0, 10)}
              required
            />
          )}
        </Field>
      </div>

      <div
        className={
          clients
            ? "grid gap-3 sm:grid-cols-[14rem_16rem_minmax(0,1fr)]"
            : "grid gap-3 sm:grid-cols-[14rem_minmax(0,1fr)]"
        }
      >
        <SelectField
          label="Category"
          name="category"
          value={category}
          onValueChange={setCategory}
          options={CATEGORY_OPTIONS}
          error={fieldError("category")}
        />

        {clients ? (
          <SelectField
            label="Client"
            name="clientId"
            value={clientId}
            onValueChange={setClientId}
            options={[
              { value: "", label: "Nobody in particular" },
              ...clients.map((client) => ({ value: client.id, label: client.name })),
            ]}
            error={fieldError("clientId")}
            hint="Optional — for a sample or a trip with no order behind it"
          />
        ) : null}

        <Field label="Notes" error={fieldError("notes")}>
          {(props) => <Input {...props} name="notes" defaultValue={expense?.notes ?? ""} />}
        </Field>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <SubmitButton size="sm" pendingLabel={expense ? "Saving…" : "Recording…"}>
          {expense ? "Save changes" : "Record expense"}
        </SubmitButton>
      </div>
    </form>
  );
}
