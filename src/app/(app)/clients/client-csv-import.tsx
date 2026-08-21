"use client";

import { useRouter } from "next/navigation";
import { checkClientDuplicates, importClients } from "./import-actions";
import { CsvImportDialog } from "@/components/csv-import/csv-import-dialog";
import { CLIENT_IMPORT_CONFIG } from "@/lib/csv/configs/clients";

/**
 * Binds the shared import component to the Clients tab.
 *
 * This wrapper is a client component on purpose: the config carries a
 * `validateRow` function, which cannot cross the server/client boundary as a
 * prop. Importing it here puts it in the browser bundle, while the two server
 * actions pass through as references.
 */
export function ClientCsvImport() {
  const router = useRouter();

  return (
    <CsvImportDialog
      config={CLIENT_IMPORT_CONFIG}
      checkDuplicates={checkClientDuplicates}
      importRows={importClients}
      onFinished={() => router.refresh()}
    />
  );
}
