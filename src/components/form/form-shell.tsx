"use client";

import { SubmitButton } from "@/components/form/submit-button";
import { Button } from "@/components/ui/button";

/**
 * The field area of a form.
 *
 * `@container`, not viewport breakpoints: these forms render both in a wide
 * dialog and in a ~24rem side panel, and `sm:` asks how big the *window* is —
 * which in the narrow panel produced three columns crushed into nothing.
 *
 * When scrollable, the fields take the height left over rather than a fixed
 * slice of the viewport, so whatever sits above them — a header, an extraction
 * panel — cannot push the buttons off the bottom of the screen.
 */
export function FormFields({
  scrollable = false,
  children,
}: {
  scrollable?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`@container ${
        scrollable ? "min-h-0 flex-1 space-y-4 overflow-y-auto pr-1" : "space-y-4"
      }`}
    >
      {children}
    </div>
  );
}

/** Cancel and submit, pinned below the fields. */
export function FormActions({
  submitLabel,
  onCancel,
}: {
  submitLabel: string;
  onCancel?: () => void;
}) {
  return (
    <div className="flex shrink-0 justify-end gap-2 border-t pt-3">
      {onCancel ? (
        // type="button": the default inside a form is submit, which would save
        // the record the user just asked to abandon.
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      ) : null}
      <SubmitButton>{submitLabel}</SubmitButton>
    </div>
  );
}
