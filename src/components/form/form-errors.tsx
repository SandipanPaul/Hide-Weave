import { AlertCircle } from "lucide-react";

/**
 * Errors that belong to the form as a whole rather than to any one input —
 * "give a phone number or an email", a failed save, a vanished record.
 *
 * Not built on ErrorNote: several messages need a stacked <div>, not a <p>.
 */
export function FormErrors({ errors }: { errors: string[] }) {
  if (errors.length === 0) return null;

  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="space-y-1">
        {errors.map((error) => (
          <p key={error}>{error}</p>
        ))}
      </div>
    </div>
  );
}
