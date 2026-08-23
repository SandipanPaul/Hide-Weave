"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { deleteExpense } from "@/app/(app)/expenses/actions";
import { ExpenseForm, type ExpenseView } from "@/components/expenses/expense-form";
import { EmptyState } from "@/components/layout/empty-state";
import { Badge } from "@/components/ui/badge";
import { useAction } from "@/components/form/use-action";
import { RowActions } from "@/components/data-table/row-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * What this order cost the agent to service.
 *
 * Deliberately separate from Payments: a payment is money coming in against
 * the commission, an expense is money going out, and totalling them in one
 * table would invite reading one as the other.
 */
export function ExpensesSection({
  projectId,
  currency,
  expenses,
  totalDisplay,
  netDisplay,
  commissionDisplay,
}: {
  projectId: string;
  currency: string;
  expenses: ExpenseView[];
  totalDisplay: string;
  /** Commission less expenses. */
  netDisplay: string;
  commissionDisplay: string;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const { run, pending } = useAction();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle>Expenses</CardTitle>
        {!adding ? (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus className="size-4" aria-hidden />
            Add expense
          </Button>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-4">
        {adding ? (
          <ExpenseForm projectId={projectId} currency={currency} onDone={() => setAdding(false)} />
        ) : null}

        {expenses.length === 0 ? (
          !adding ? (
            <EmptyState
              title="No expenses on this order"
              description="Record what servicing this order cost you — courier, samples, travel. They come off your commission, not off what the client owes."
              action={
                <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
                  <Plus className="size-4" aria-hidden />
                  Add the first one
                </Button>
              }
            />
          ) : null
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Spent on</TableHead>
                    <TableHead>What for</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="w-10">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map((expense) =>
                    editingId === expense.id ? (
                      <TableRow key={expense.id}>
                        <TableCell colSpan={5} className="p-0">
                          <ExpenseForm
                            projectId={projectId}
                            currency={currency}
                            expense={expense}
                            onDone={() => setEditingId(null)}
                          />
                        </TableCell>
                      </TableRow>
                    ) : (
                      <TableRow key={expense.id}>
                        <TableCell className="whitespace-nowrap tabular-nums">
                          {expense.displayDate}
                        </TableCell>
                        <TableCell className="max-w-[24ch] truncate font-medium">
                          {expense.description}
                          {expense.notes ? (
                            <span className="ml-2 text-xs text-muted-foreground">
                              {expense.notes}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          {expense.categoryLabel ? (
                            <Badge variant="outline" className="font-normal">
                              {expense.categoryLabel}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right font-medium tabular-nums">
                          {expense.amountDisplay}
                        </TableCell>
                        <TableCell>
                          <RowActions
                            pending={pending}
                            editLabel={`Edit expense of ${expense.amountDisplay} on ${expense.displayDate}`}
                            onEdit={() => setEditingId(expense.id)}
                            deleteLabel={`Delete expense of ${expense.amountDisplay} on ${expense.displayDate}`}
                            confirmTitle="Delete this expense?"
                            confirmDescription={`${expense.amountDisplay} spent on ${expense.displayDate} will be removed, and this order's net earnings will go back up.`}
                            confirmLabel="Delete expense"
                            onDelete={() => run(() => deleteExpense(expense.id), "Expense deleted.")}
                          />
                        </TableCell>
                      </TableRow>
                    ),
                  )}
                </TableBody>
              </Table>
            </div>

            <dl className="flex flex-wrap items-baseline justify-end gap-x-8 gap-y-2 border-t pt-3 text-sm">
              <div className="flex items-baseline gap-2">
                <dt className="text-muted-foreground">Commission</dt>
                <dd className="font-medium tabular-nums">{commissionDisplay}</dd>
              </div>
              <div className="flex items-baseline gap-2">
                <dt className="text-muted-foreground">Expenses</dt>
                <dd className="font-medium tabular-nums">−{totalDisplay}</dd>
              </div>
              <div className="flex items-baseline gap-2">
                <dt className="font-medium">Net on this order</dt>
                <dd className="text-base font-semibold tabular-nums">{netDisplay}</dd>
              </div>
            </dl>
          </>
        )}
      </CardContent>
    </Card>
  );
}
