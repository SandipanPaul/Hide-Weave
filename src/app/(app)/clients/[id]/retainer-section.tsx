"use client";

import { Check, Loader2 } from "lucide-react";
import { deleteRetainerPaid, recordRetainerPaid } from "../actions";
import { EmptyState } from "@/components/layout/empty-state";
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

export type RetainerReceiptView = {
  id: string;
  amountDisplay: string;
  displayDate: string;
};

/**
 * The client's retainer: what they are charged, and each fee as it comes in.
 *
 * One button, pressed by hand. A retainer is only income once the client has
 * actually paid, and the only person who knows that is the agent — so nothing
 * is assumed, accrued or scheduled. Each press logs today's fee at the rate
 * currently on the client, and it lands in the Finances passbook.
 */
export function RetainerSection({
  clientId,
  rateDisplay,
  receipts,
  totalDisplay,
}: {
  clientId: string;
  /** Null when no monthly amount is set, which is when the button is useless. */
  rateDisplay: string | null;
  receipts: RetainerReceiptView[];
  totalDisplay: string;
}) {
  const { run, pending } = useAction();

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Retainer</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {rateDisplay ? (
              <>
                {rateDisplay} a month. Press the button each time this client pays, and it goes
                into the passbook.
              </>
            ) : (
              <>Set a monthly retainer amount on this client to start logging fees.</>
            )}
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          disabled={pending || !rateDisplay}
          onClick={() => run(() => recordRetainerPaid(clientId), "Retainer fee logged.")}
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Check className="size-4" aria-hidden />
          )}
          Retainer fees paid
        </Button>
      </CardHeader>

      <CardContent>
        {receipts.length === 0 ? (
          <EmptyState
            title="No retainer fees logged"
            description="Nothing is assumed — a fee only counts as income once you record it here."
            className="py-8"
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Received on</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="w-10">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {receipts.map((receipt) => (
                    <TableRow key={receipt.id}>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {receipt.displayDate}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right font-medium tabular-nums">
                        {receipt.amountDisplay}
                      </TableCell>
                      <TableCell>
                        <RowActions
                          pending={pending}
                          deleteLabel={`Delete retainer fee of ${receipt.amountDisplay} on ${receipt.displayDate}`}
                          confirmTitle="Delete this retainer fee?"
                          confirmDescription={`${receipt.amountDisplay} received on ${receipt.displayDate} will be removed from the ledger.`}
                          confirmLabel="Delete fee"
                          onDelete={() =>
                            run(() => deleteRetainerPaid(receipt.id), "Retainer fee deleted.")
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <dl className="flex items-baseline justify-end gap-2 border-t pt-3 text-sm">
              <dt className="text-muted-foreground">Total received</dt>
              <dd className="text-base font-semibold tabular-nums">{totalDisplay}</dd>
            </dl>
          </>
        )}
      </CardContent>
    </Card>
  );
}
