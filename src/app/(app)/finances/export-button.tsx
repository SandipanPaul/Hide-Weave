"use client";

import { useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, Download, Loader2 } from "lucide-react";
import { exportFinancesCsv, exportLedgerCsv } from "./export-actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { downloadCsv } from "@/lib/csv/download";

/**
 * Two exports, because they answer two different questions and cannot be one
 * file without lying about one of them.
 *
 * **Ledger** is the passbook row for row, with a running balance, so it
 * reconciles: the last balance in the file is the closing balance on screen.
 *
 * **Orders** is the business behind the figures — order value, rate,
 * commission, what is still owed. Its `Received` column counts every payment
 * ever made against an order and stops at the commission owed, so it is
 * deliberately not a record of cash in the range.
 */
export function ExportButton() {
  const searchParams = useSearchParams();
  const [isPending, startExport] = useTransition();

  const download = (
    build: (params: Record<string, string>) => Promise<{ filename: string; csv: string }>,
  ) =>
    startExport(async () => {
      try {
        const { filename, csv } = await build(Object.fromEntries(searchParams.entries()));
        downloadCsv(filename, csv);
      } catch {
        toast.error("Could not build the export. Please try again.");
      }
    });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" disabled={isPending} />}>
        {isPending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Download className="size-4" aria-hidden />
        )}
        Export CSV
        <ChevronDown className="size-3.5 opacity-60" aria-hidden />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="max-w-72">
        <DropdownMenuItem onClick={() => download(exportLedgerCsv)}>
          <span>
            <span className="font-medium">Ledger</span>
            <span className="block text-xs text-muted-foreground">
              Every entry in the passbook, with its running balance
            </span>
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => download(exportFinancesCsv)}>
          <span>
            <span className="font-medium">Orders</span>
            <span className="block text-xs text-muted-foreground">
              One row per order: value, rate, commission, outstanding
            </span>
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
