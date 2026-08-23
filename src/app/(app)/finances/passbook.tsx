"use client";

import { useState } from "react";
import { TableLink } from "@/components/data-table/table-link";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { deleteExpense } from "@/app/(app)/expenses/actions";
import {
  ExpenseForm,
  type ClientOption,
  type ExpenseView,
} from "@/components/expenses/expense-form";
import { EmptyState } from "@/components/layout/empty-state";
import { useAction } from "@/components/form/use-action";
import { RowActions } from "@/components/data-table/row-actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** One line of the passbook, already formatted by the server. */
export type PassbookRow = {
  id: string;
  displayDate: string;
  direction: "IN" | "OUT";
  kind: "COMMISSION" | "RETAINER" | "EXPENSE";
  kindLabel: string;
  description: string;
  amountDisplay: string;
  balanceDisplay: string;
  /** True when the running balance has gone below zero at this point. */
  balanceNegative: boolean;
  projectId: string | null;
  orderId: string | null;
  /** A deleted order is still named, but no longer linked. */
  orderExists: boolean;
  categoryLabel: string | null;
  /** Set on expense rows — the payload its edit form needs. */
  expense: ExpenseView | null;
};

/**
 * The account, as a passbook: every transaction in the range oldest first,
 * money in — commission and retainers — and expenses out, with the balance
 * after each one.
 *
 * Only real movements of money appear. Commission earned on an order that has
 * not paid, and a retainer billed but not received, are not transactions and
 * live on the cards above; a passbook that included money nobody had sent yet
 * would not be one.
 *
 * Only expenses are editable here. Commission belongs to an order and is
 * corrected on its page, where the balance it settles is visible; a retainer
 * row is not a record at all but a month derived from the schedule, so it is
 * changed by starting or stopping the retainer on its client.
 */
export function Passbook({
  rows,
  currency,
  clients,
  totalInDisplay,
  totalOutDisplay,
  netDisplay,
  netNegative,
}: {
  rows: PassbookRow[];
  /** The currency being viewed — general expenses are recorded in it. */
  currency: string;
  clients: readonly ClientOption[];
  totalInDisplay: string;
  totalOutDisplay: string;
  netDisplay: string;
  netNegative: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const { run, pending } = useAction();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Passbook</CardTitle>
        <p className="text-sm text-muted-foreground">
          Every transaction in this range, oldest first — commission and retainers in, expenses
          out. Retainer rows follow each client&apos;s schedule; expenses are added at the top of
          this page.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {rows.length === 0 ? (
          <EmptyState
            title="No transactions in this range"
            description="Payments recorded against orders, and the retainers and expenses you add at the top of this page, all appear here as one running account."
            className="py-10"
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Detail</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead className="text-right">In</TableHead>
                    <TableHead className="text-right">Out</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead className="w-10">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    if (row.expense && editingId === row.id) {
                      return (
                        <TableRow key={row.id}>
                          <TableCell colSpan={7} className="p-0">
                            <ExpenseForm
                              projectId={row.projectId ?? undefined}
                              currency={currency}
                              clients={clients}
                              expense={row.expense}
                              onDone={() => setEditingId(null)}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    }

                    return (
                      <TableRow key={row.id}>
                        <TableCell className="whitespace-nowrap tabular-nums">
                          {row.displayDate}
                        </TableCell>
                        <TableCell className="max-w-[30ch]">
                          <span className="flex items-center gap-1.5">
                            {row.direction === "IN" ? (
                              <ArrowDownLeft
                                className="size-3.5 shrink-0 text-emerald-700 dark:text-emerald-500"
                                aria-label="Money in"
                              />
                            ) : (
                              <ArrowUpRight
                                className="size-3.5 shrink-0 text-muted-foreground"
                                aria-label="Money out"
                              />
                            )}
                            <span className="truncate font-medium">{row.description}</span>
                          </span>
                          <span className="mt-1 flex flex-wrap gap-1">
                            <Badge variant="outline" className="font-normal">
                              {row.kindLabel}
                            </Badge>
                            {row.categoryLabel ? (
                              <Badge variant="outline" className="font-normal">
                                {row.categoryLabel}
                              </Badge>
                            ) : null}
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {row.orderId && row.projectId && row.orderExists ? (
                            <TableLink
                              href={`/projects/${row.projectId}`}
                            >
                              {row.orderId}
                            </TableLink>
                          ) : row.orderId ? (
                            // The order was deleted; the money it moved was not.
                            <span className="text-muted-foreground" title="This order was deleted">
                              {row.orderId}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right font-medium tabular-nums text-emerald-700 dark:text-emerald-500">
                          {row.direction === "IN" ? row.amountDisplay : ""}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right font-medium tabular-nums">
                          {row.direction === "OUT" ? row.amountDisplay : ""}
                        </TableCell>
                        <TableCell
                          className={`whitespace-nowrap text-right tabular-nums ${
                            row.balanceNegative ? "text-destructive" : "text-muted-foreground"
                          }`}
                        >
                          {row.balanceDisplay}
                        </TableCell>
                        <TableCell>
                          {row.expense ? (
                            <RowActions
                              pending={pending}
                              editLabel={`Edit ${row.description} on ${row.displayDate}`}
                              onEdit={() => setEditingId(row.id)}
                              deleteLabel={`Delete ${row.description} on ${row.displayDate}`}
                              confirmTitle="Delete this expense?"
                              confirmDescription={`${row.amountDisplay} on ${row.displayDate} will be removed, and the balance will change to match.`}
                              confirmLabel="Delete expense"
                              onDelete={() => run(() => deleteExpense(row.expense!.id), "Expense deleted.")}
                            />
                          ) : (
                            // Commission is corrected on its order; a retainer
                            // row is derived from the schedule and changes by
                            // starting or stopping it on the client.
                            <span className="sr-only">
                              Not editable here — change it where it was recorded
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <dl className="flex flex-wrap items-baseline justify-end gap-x-8 gap-y-2 border-t pt-3 text-sm">
              <div className="flex items-baseline gap-2">
                <dt className="text-muted-foreground">Total in</dt>
                <dd className="font-medium tabular-nums">{totalInDisplay}</dd>
              </div>
              <div className="flex items-baseline gap-2">
                <dt className="text-muted-foreground">Total out</dt>
                <dd className="font-medium tabular-nums">−{totalOutDisplay}</dd>
              </div>
              <div className="flex items-baseline gap-2">
                <dt className="font-medium">Closing balance</dt>
                <dd
                  className={`text-base font-semibold tabular-nums ${
                    netNegative ? "text-destructive" : ""
                  }`}
                >
                  {netDisplay}
                </dd>
              </div>
            </dl>
          </>
        )}
      </CardContent>
    </Card>
  );
}
