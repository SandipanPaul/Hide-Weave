import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildListHref, type ListParams, type Pagination } from "@/lib/list-params";

export function PaginationBar({
  pagination,
  params,
  pathname,
  unit = "rows",
}: {
  pagination: Pagination;
  params: ListParams;
  pathname: string;
  unit?: string;
}) {
  const { page, pageCount, total, from, to } = pagination;
  const hasPrevious = page > 1;
  const hasNext = page < pageCount;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-1 py-3 text-sm">
      <p className="text-muted-foreground" aria-live="polite">
        {total === 0 ? `No ${unit}` : `${from}–${to} of ${total} ${unit}`}
      </p>

      {pageCount > 1 ? (
        <nav aria-label="Pagination" className="flex items-center gap-2">
          {/* Base UI renders as another element via `render`, not `asChild`.
              A link is not a native button, so it must say so. */}
          <Button
            variant="outline"
            size="sm"
            nativeButton={!hasPrevious}
            disabled={!hasPrevious}
            render={
              hasPrevious ? (
                <Link href={buildListHref(pathname, params, { page: page - 1 })} scroll={false} />
              ) : undefined
            }
          >
            <ChevronLeft className="size-4" aria-hidden />
            Previous
          </Button>

          <span className="px-1 text-muted-foreground">
            Page {page} of {pageCount}
          </span>

          <Button
            variant="outline"
            size="sm"
            nativeButton={!hasNext}
            disabled={!hasNext}
            render={
              hasNext ? (
                <Link href={buildListHref(pathname, params, { page: page + 1 })} scroll={false} />
              ) : undefined
            }
          >
            Next
            <ChevronRight className="size-4" aria-hidden />
          </Button>
        </nav>
      ) : null}
    </div>
  );
}
