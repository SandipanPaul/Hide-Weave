"use client";

import {
  ExpenseForm,
  type ClientOption,
} from "@/components/expenses/expense-form";
import { AddDialog } from "@/components/form/add-dialog";

/**
 * Adding an expense that belongs to no order, from the page header where it
 * is reachable without scrolling.
 *
 * It lives here rather than inside the passbook because it depends on nothing
 * the passbook shows, and burying it under the charts made it findable only by
 * someone who already knew it existed.
 *
 * There is no retainer equivalent: a retainer is started and stopped on the
 * client it belongs to, and its monthly charges are derived from that.
 */

export function AddExpenseDialog({
  currency,
  clients,
}: {
  /** The currency being viewed — a standalone expense is recorded in it. */
  currency: string;
  clients: readonly ClientOption[];
}) {
  return (
    <AddDialog
      triggerLabel="Add expense"
      title="Add an expense"
      description={`Money you spent with no order behind it — a trip, a sample, an overhead. Recorded in ${currency}.`}
      className="sm:max-w-3xl"
    >
      {({ close }) => (
        <ExpenseForm currency={currency} clients={clients} onDone={close} />
      )}
    </AddDialog>
  );
}
