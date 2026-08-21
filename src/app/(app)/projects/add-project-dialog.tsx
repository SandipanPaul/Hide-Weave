"use client";

import { createProject } from "./actions";
import { ProjectForm, type ProjectFormOptions } from "./project-form";
import { AddDialog } from "@/components/form/add-dialog";

export function AddProjectDialog({
  options,
  triggerLabel = "Add project",
}: {
  options: ProjectFormOptions;
  triggerLabel?: string;
}) {
  return (
    <AddDialog
      triggerLabel={triggerLabel}
      title="Add project"
      description="The commission is computed from the order value and percentage — check it before saving."
      className="sm:max-w-3xl"
    >
      {({ close, done }) => (
        <ProjectForm
          action={createProject}
          options={options}
          submitLabel="Add project"
          successMessage="Project added."
          scrollable
          onCancel={close}
          onSuccess={done}
        />
      )}
    </AddDialog>
  );
}
