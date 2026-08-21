"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";

/** The error boundary every list route renders. */
export function RouteError({
  error,
  reset,
  label,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  /** What failed to load, e.g. "clients". */
  label: string;
}) {
  useEffect(() => {
    // No error-reporting service in this app by design — the console is it.
    console.error(error);
  }, [error]);

  return (
    <EmptyState
      icon={AlertTriangle}
      title={`Something went wrong loading ${label}`}
      description={error.message || "The database may be unavailable. Try again in a moment."}
      action={
        <Button variant="outline" onClick={reset}>
          Try again
        </Button>
      }
    />
  );
}
