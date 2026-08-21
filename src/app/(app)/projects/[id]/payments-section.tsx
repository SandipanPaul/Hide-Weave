"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { createPayment, deletePayment, updatePayment } from "../actions";
import { Field } from "@/components/form/field";
import { FormErrors } from "@/components/form/form-errors";
import { SubmitButton } from "@/components/form/submit-button";
import { EmptyState } from "@/components/layout/empty-state";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ActionResult } from "@/lib/schemas";

/** Amounts arrive already formatted — the server owns money rendering. */
export type PaymentView = {
  id: string;
  paidOn: string;
  displayDate: string;
  amountDisplay: string;
  /** The same amount as a plain number, for the edit form. */
  amountInput: string;
  balanceDisplay: string;
  method: string | null;
  notes: string | null;
};

function PaymentForm({
  projectId,
  currency,
  payment,
  suggestedAmount,
  onDone,
}: {
  projectId: string;
  currency: string;
  /** Present when correcting an existing payment rather than adding one. */
  payment?: PaymentView;
  /** The outstanding balance, pre-filled as the most likely amount. */
  suggestedAmount: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const action = payment
    ? updatePayment.bind(null, payment.id)
    : createPayment.bind(null, projectId);
  const [state, formAction] = useActionState<ActionResult<{ id: string }> | null, FormData>(
    action,
    null,
  );

  const fieldError = (name: string) =>
    state && !state.ok ? state.fieldErrors[name]?.[0] : undefined;

  useEffect(() => {
    if (state?.ok) {
      toast.success(payment ? "Payment updated." : "Payment recorded.");
      onDone();
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction} className="space-y-3 rounded-lg border bg-muted/30 p-4">
      {state && !state.ok ? <FormErrors errors={state.formErrors} /> : null}

      <div className="grid gap-3 sm:grid-cols-[10rem_11rem_minmax(0,1fr)]">
        <Field label={`Amount (${currency})`} required error={fieldError("amount")}>
          {(props) => (
            <Input
              {...props}
              name="amount"
              inputMode="decimal"
              defaultValue={payment ? payment.amountInput : suggestedAmount}
              placeholder="0.00"
              autoFocus
            />
          )}
        </Field>

        <Field label="Paid on" required error={fieldError("paidOn")}>
          {(props) => (
            <Input
              {...props}
              name="paidOn"
              type="date"
              defaultValue={payment ? payment.paidOn : new Date().toISOString().slice(0, 10)}
              required
            />
          )}
        </Field>

        <Field label="Method" error={fieldError("method")} hint="Optional — NEFT, cheque…">
          {(props) => (
            <Input {...props} name="method" defaultValue={payment?.method ?? ""} placeholder="NEFT" />
          )}
        </Field>
      </div>

      <Field label="Notes" error={fieldError("notes")}>
        {(props) => <Input {...props} name="notes" defaultValue={payment?.notes ?? ""} />}
      </Field>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <SubmitButton size="sm" pendingLabel={payment ? "Saving…" : "Recording…"}>
          {payment ? "Save changes" : "Record payment"}
        </SubmitButton>
      </div>
    </form>
  );
}

/**
 * The payment ledger for one project, with the balance remaining after each
 * payment. Payments settle the commission, never the order value.
 */
export function PaymentsSection({
  projectId,
  currency,
  payments,
  outstandingInput,
  settled,
}: {
  projectId: string;
  currency: string;
  payments: PaymentView[];
  /** Outstanding balance as a plain editable number, for the form's default. */
  outstandingInput: string;
  settled: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const remove = (id: string) => {
    startTransition(async () => {
      const result = await deletePayment(id);
      if (result.ok) {
        toast.success("Payment deleted.");
        router.refresh();
      } else {
        toast.error(result.formErrors[0] ?? "That didn't work. Please try again.");
      }
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle>Payments</CardTitle>
        {!adding ? (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus className="size-4" aria-hidden />
            Record payment
          </Button>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-4">
        {adding ? (
          <PaymentForm
            projectId={projectId}
            currency={currency}
            suggestedAmount={outstandingInput}
            onDone={() => setAdding(false)}
          />
        ) : null}

        {payments.length === 0 ? (
          !adding ? (
            <EmptyState
              title="No payments yet"
              description="Record part payments as they arrive — they settle the commission on this order."
              action={
                <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
                  <Plus className="size-4" aria-hidden />
                  Record the first one
                </Button>
              }
            />
          ) : null
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Paid on</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Balance remaining</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="w-10">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((payment) =>
                  editingId === payment.id ? (
                    <TableRow key={payment.id}>
                      <TableCell colSpan={5} className="p-0">
                        <PaymentForm
                          projectId={projectId}
                          currency={currency}
                          payment={payment}
                          suggestedAmount={outstandingInput}
                          onDone={() => setEditingId(null)}
                        />
                      </TableCell>
                    </TableRow>
                  ) : (
                  <TableRow key={payment.id}>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {payment.displayDate}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right font-medium tabular-nums">
                      {payment.amountDisplay}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums text-muted-foreground">
                      {payment.balanceDisplay}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {payment.method ?? "—"}
                      {payment.notes ? (
                        <span className="ml-2 text-xs">{payment.notes}</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={isPending}
                        aria-label={`Edit payment of ${payment.amountDisplay} on ${payment.displayDate}`}
                        onClick={() => setEditingId(payment.id)}
                      >
                        <Pencil className="size-4" aria-hidden />
                      </Button>

                      <AlertDialog>
                        <AlertDialogTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              disabled={isPending}
                              aria-label={`Delete payment of ${payment.amountDisplay} on ${payment.displayDate}`}
                            />
                          }
                        >
                          {isPending ? (
                            <Loader2 className="size-4 animate-spin" aria-hidden />
                          ) : (
                            <Trash2 className="size-4" aria-hidden />
                          )}
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete this payment?</AlertDialogTitle>
                            <AlertDialogDescription>
                              {payment.amountDisplay} received on {payment.displayDate} will be
                              removed, and the balance owed will go back up.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Keep it</AlertDialogCancel>
                            <AlertDialogAction onClick={() => remove(payment.id)}>
                              Delete payment
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                  ),
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {settled && payments.length > 0 ? (
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-500">
            This project&apos;s commission is fully settled.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
