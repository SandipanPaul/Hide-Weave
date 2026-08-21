import { AlertCircle } from "lucide-react";

/**
 * One thing that went wrong, called out in place — a failed parse, a failed
 * save. Announced immediately, since it always appears in response to
 * something the user just did.
 */
export function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      {children}
    </p>
  );
}
