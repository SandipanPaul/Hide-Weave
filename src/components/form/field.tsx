"use client";

import { useId } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * The aria wiring for a control with an optional error and hint: ids derived
 * from the control's own id, and the describedby list naming whichever of the
 * two is actually rendered.
 */
export function messageIds(id: string, error?: string, hint?: string) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  return {
    errorId,
    hintId,
    // Exactly one of the two is ever rendered, so describedby names exactly
    // one — pointing at an id that isn't on the page tells a screen reader
    // nothing.
    describedBy: error ? errorId : hint ? hintId : undefined,
  };
}

/**
 * The lines under a control. The hint steps aside for an error rather than
 * stacking with it — two messages about one input is one too many.
 */
export function FieldMessages({
  id,
  error,
  hint,
}: {
  id: string;
  error?: string;
  hint?: string;
}) {
  const { errorId, hintId } = messageIds(id, error, hint);
  if (error) {
    return (
      <p id={errorId} className="text-xs font-medium text-destructive">
        {error}
      </p>
    );
  }
  if (hint) {
    return (
      <p id={hintId} className="text-xs text-muted-foreground">
        {hint}
      </p>
    );
  }
  return null;
}

/**
 * One labelled control with its error and hint wired up for screen readers:
 * the label points at the input, and the input points back at whichever of the
 * error and hint are present.
 */
export function Field({
  label,
  error,
  hint,
  required,
  annotation,
  className,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  /** A small note beside the label, e.g. that a value was auto-filled. */
  annotation?: React.ReactNode;
  className?: string;
  children: (props: {
    id: string;
    "aria-invalid": true | undefined;
    "aria-describedby": string | undefined;
  }) => React.ReactNode;
}) {
  const id = useId();
  const { describedBy } = messageIds(id, error, hint);

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {required ? (
          <span className="text-destructive" aria-hidden>
            *
          </span>
        ) : null}
        {required ? <span className="sr-only">(required)</span> : null}
        {annotation}
      </Label>

      {children({
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy,
      })}

      <FieldMessages id={id} error={error} hint={hint} />
    </div>
  );
}
