"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { checkProjectDuplicates, importProjects } from "./import-actions";
import { CsvImportDialog } from "@/components/csv-import/csv-import-dialog";
import { buildProjectImportConfig } from "@/lib/csv/configs/projects";
import type { ProjectFormOptions } from "./project-form";

/**
 * Binds the shared import component to the Projects tab.
 *
 * A client component on purpose: the config carries a `validateRow` function,
 * which cannot cross the server/client boundary as a prop. The clients and
 * exporters it resolves names against are plain data, so those do cross.
 */
export function ProjectCsvImport({ options }: { options: ProjectFormOptions }) {
  const router = useRouter();

  const config = useMemo(
    () =>
      buildProjectImportConfig(
        options.clients.map((client) => ({ id: client.id, name: client.name })),
        options.exporters.map((exporter) => ({
          id: exporter.id,
          name: exporter.companyName,
        })),
      ),
    [options],
  );

  return (
    <CsvImportDialog
      config={config}
      checkDuplicates={checkProjectDuplicates}
      importRows={importProjects}
      onFinished={() => router.refresh()}
    />
  );
}
