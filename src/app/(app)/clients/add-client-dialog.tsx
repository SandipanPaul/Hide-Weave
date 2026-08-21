"use client";

import { createClient } from "./actions";
import { ClientForm } from "./client-form";
import { AddDialog } from "@/components/form/add-dialog";

export function AddClientDialog({ triggerLabel = "Add client" }: { triggerLabel?: string }) {
  return (
    <AddDialog
      triggerLabel={triggerLabel}
      title="Add client"
      description="Name is required, along with a phone number or an email address."
    >
      {({ close, done }) => (
        <ClientForm
          action={createClient}
          submitLabel="Add client"
          successMessage="Client added."
          scrollable
          onCancel={close}
          onSuccess={done}
        />
      )}
    </AddDialog>
  );
}
