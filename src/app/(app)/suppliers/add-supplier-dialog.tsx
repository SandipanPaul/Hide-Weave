"use client";

import { useState } from "react";
import { createSupplier } from "./actions";
import { ExtractPanel } from "./extract-panel";
import {
  EMPTY_SUPPLIER,
  SupplierForm,
  type SupplierField,
  type SupplierFormValues,
} from "./supplier-form";
import { AddDialog } from "@/components/form/add-dialog";

export function AddSupplierDialog({ triggerLabel = "Add supplier" }: { triggerLabel?: string }) {
  const [values, setValues] = useState<SupplierFormValues>(EMPTY_SUPPLIER);
  const [autoFilled, setAutoFilled] = useState<SupplierField[]>([]);
  // Remounts the form so a fresh extraction replaces what it holds. Without
  // this the controlled inputs would keep the previous run's values.
  const [formKey, setFormKey] = useState(0);

  const reset = () => {
    setValues(EMPTY_SUPPLIER);
    setAutoFilled([]);
    setFormKey((current) => current + 1);
  };

  return (
    <AddDialog
      triggerLabel={triggerLabel}
      title="Add supplier"
      description="Paste their website to fill this in, or type it yourself. Only the company name is required."
      onClose={reset}
    >
      {({ close, done }) => (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
          <ExtractPanel
            onExtracted={(result) => {
              if (!result.ok) return;
              setValues({ ...EMPTY_SUPPLIER, ...result.values });
              setAutoFilled(result.autoFilled as SupplierField[]);
              setFormKey((current) => current + 1);
            }}
          />

          <SupplierForm
            key={formKey}
            action={createSupplier}
            initialValues={values}
            autoFilled={autoFilled}
            submitLabel="Add supplier"
            successMessage="Supplier added."
            scrollable
            onCancel={close}
            onSuccess={done}
          />
        </div>
      )}
    </AddDialog>
  );
}
