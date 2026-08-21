"use client";

import { useState } from "react";
import { createExporter } from "./actions";
import { ExtractPanel } from "./extract-panel";
import {
  EMPTY_EXPORTER,
  ExporterForm,
  type ExporterField,
  type ExporterFormValues,
} from "./exporter-form";
import { AddDialog } from "@/components/form/add-dialog";

export function AddExporterDialog({ triggerLabel = "Add exporter" }: { triggerLabel?: string }) {
  const [values, setValues] = useState<ExporterFormValues>(EMPTY_EXPORTER);
  const [autoFilled, setAutoFilled] = useState<ExporterField[]>([]);
  // Remounts the form so a fresh extraction replaces what it holds. Without
  // this the controlled inputs would keep the previous run's values.
  const [formKey, setFormKey] = useState(0);

  const reset = () => {
    setValues(EMPTY_EXPORTER);
    setAutoFilled([]);
    setFormKey((current) => current + 1);
  };

  return (
    <AddDialog
      triggerLabel={triggerLabel}
      title="Add exporter"
      description="Paste their website to fill this in, or type it yourself. Only the company name is required."
      onClose={reset}
    >
      {({ close, done }) => (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
          <ExtractPanel
            onExtracted={(result) => {
              if (!result.ok) return;
              setValues({ ...EMPTY_EXPORTER, ...result.values });
              setAutoFilled(result.autoFilled as ExporterField[]);
              setFormKey((current) => current + 1);
            }}
          />

          <ExporterForm
            key={formKey}
            action={createExporter}
            initialValues={values}
            autoFilled={autoFilled}
            submitLabel="Add exporter"
            successMessage="Exporter added."
            scrollable
            onCancel={close}
            onSuccess={done}
          />
        </div>
      )}
    </AddDialog>
  );
}
