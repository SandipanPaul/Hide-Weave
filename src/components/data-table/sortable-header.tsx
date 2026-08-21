import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { sortHref, type ListParams, type SortDirection } from "@/lib/list-params";

/**
 * A column header that sorts by link rather than by client-side state, so the
 * sorted view is in the URL and survives a refresh or a shared link.
 */
export function SortableHeader({
  column,
  label,
  params,
  pathname,
  naturalDir = "asc",
  align = "left",
  className,
}: {
  column: string;
  label: string;
  params: ListParams;
  pathname: string;
  naturalDir?: SortDirection;
  align?: "left" | "right";
  className?: string;
}) {
  const active = params.sort === column;
  const Icon = !active ? ChevronsUpDown : params.dir === "asc" ? ArrowUp : ArrowDown;

  return (
    <TableHead
      className={cn(align === "right" && "text-right", className)}
      aria-sort={active ? (params.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <Link
        href={sortHref(pathname, params, column, naturalDir)}
        scroll={false}
        className={cn(
          "inline-flex items-center gap-1 rounded-sm py-1 font-medium transition-colors hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          align === "right" && "flex-row-reverse",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
        <Icon className={cn("size-3.5", !active && "opacity-50")} aria-hidden />
        <span className="sr-only">
          {active
            ? `Sorted ${params.dir === "asc" ? "ascending" : "descending"}. Activate to reverse.`
            : "Activate to sort by this column."}
        </span>
      </Link>
    </TableHead>
  );
}
