import { Skeleton } from "@/components/ui/skeleton";

/** The loading state for every list route: header, search box, then rows. */
export function ListSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading {label}…</span>
      <Skeleton className="h-9 w-40" />
      <Skeleton className="h-9 w-64" />
      <div className="space-y-2 rounded-lg border p-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="h-9 w-full" />
        ))}
      </div>
    </div>
  );
}
