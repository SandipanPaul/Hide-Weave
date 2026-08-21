"use client";

import { useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Download, Loader2 } from "lucide-react";
import { exportEconomicsCsv } from "./export-actions";
import { Button } from "@/components/ui/button";
import { downloadCsv } from "@/lib/csv/download";

/** Downloads the orders behind the dashboard, for the range currently shown. */
export function ExportButton() {
  const searchParams = useSearchParams();
  const [isPending, startExport] = useTransition();

  return (
    <Button
      variant="outline"
      disabled={isPending}
      onClick={() =>
        startExport(async () => {
          try {
            const { filename, csv } = await exportEconomicsCsv(
              Object.fromEntries(searchParams.entries()),
            );
            downloadCsv(filename, csv);
          } catch {
            toast.error("Could not build the export. Please try again.");
          }
        })
      }
    >
      {isPending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <Download className="size-4" aria-hidden />
      )}
      Export CSV
    </Button>
  );
}
