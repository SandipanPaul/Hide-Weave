import { PaginationBar } from "@/components/data-table/pagination";
import { Table } from "@/components/ui/table";
import type { ListParams, Pagination } from "@/lib/list-params";

/**
 * The frame every list tab draws its table in: a bordered card, a horizontal
 * scroller, and the pagination bar underneath.
 *
 * Three tables had this outer structure written out identically. The scroller
 * is the part worth having in one place — without it a narrow screen squashes
 * the columns instead of letting the table scroll, and that is easy to leave
 * out of a fourth copy.
 */
export function TableShell({
  pagination,
  params,
  pathname,
  unit,
  children,
}: {
  pagination: Pagination;
  params: ListParams;
  pathname: string;
  /** Plural noun for the pagination summary — "clients", "projects". */
  unit: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border">
      {/* Narrow screens scroll the table rather than squashing the columns. */}
      <div className="overflow-x-auto">
        <Table>{children}</Table>
      </div>

      <PaginationBar pagination={pagination} params={params} pathname={pathname} unit={unit} />
    </div>
  );
}
