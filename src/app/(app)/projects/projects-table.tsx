import { TableLink } from "@/components/data-table/table-link";
import { SortableHeader } from "@/components/data-table/sortable-header";
import { TableShell } from "@/components/data-table/table-shell";
import { ProjectStatusBadge } from "@/components/status-badge";
import {
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateOnly } from "@/lib/dates";
import { formatMoneyPlain } from "@/lib/money";
import type { CurrencyTotal, ProjectListRow } from "@/lib/projects/queries";
import type { ListParams, Pagination } from "@/lib/list-params";

const PATH = "/projects";

export function ProjectsTable({
  rows,
  pagination,
  params,
  totals,
}: {
  rows: ProjectListRow[];
  pagination: Pagination;
  params: ListParams;
  totals: CurrencyTotal[];
}) {
  return (
    <TableShell pagination={pagination} params={params} pathname={PATH} unit="projects">
      <TableHeader>
        <TableRow>
          <SortableHeader column="orderId" label="Order ID" params={params} pathname={PATH} />
          <SortableHeader column="client" label="Client" params={params} pathname={PATH} />
          <SortableHeader column="product" label="Product" params={params} pathname={PATH} />
          <SortableHeader
            column="quantity"
            label="Qty"
            params={params}
            pathname={PATH}
            naturalDir="desc"
            align="right"
          />
          <SortableHeader
            column="orderValue"
            label="Order value"
            params={params}
            pathname={PATH}
            naturalDir="desc"
            align="right"
          />
          <SortableHeader
            column="commissionPercentage"
            label="Comm %"
            params={params}
            pathname={PATH}
            naturalDir="desc"
            align="right"
          />
          <SortableHeader
            column="commission"
            label="Commission"
            params={params}
            pathname={PATH}
            naturalDir="desc"
            align="right"
          />
          <SortableHeader column="status" label="Status" params={params} pathname={PATH} />
          <SortableHeader
            column="orderDate"
            label="Ordered"
            params={params}
            pathname={PATH}
            naturalDir="desc"
          />
        </TableRow>
      </TableHeader>

      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="font-medium">
              <TableLink
                href={`/projects/${row.id}`}
              >
                {row.orderId}
              </TableLink>
            </TableCell>

            <TableCell className="max-w-[18ch] truncate">
              <TableLink
                href={`/clients/${row.clientId}`}
              >
                {row.clientName}
              </TableLink>
            </TableCell>

            <TableCell className="max-w-[20ch] truncate">{row.product}</TableCell>

            <TableCell className="whitespace-nowrap text-right tabular-nums">
              {row.quantity.toLocaleString("en-IN")}
              <span className="ml-1 text-xs text-muted-foreground">{row.unit}</span>
            </TableCell>

            {/* The currency sits with the order value rather than being
                repeated in every money column. */}
            <TableCell className="whitespace-nowrap text-right tabular-nums">
              <span className="mr-1 text-xs text-muted-foreground">{row.currency}</span>
              {formatMoneyPlain(row.orderValue, row.currency)}
            </TableCell>

            <TableCell className="text-right tabular-nums text-muted-foreground">
              {row.commissionPercentage}%
            </TableCell>

            <TableCell className="whitespace-nowrap text-right font-medium tabular-nums">
              {formatMoneyPlain(row.commission, row.currency)}
            </TableCell>

            <TableCell>
              <ProjectStatusBadge status={row.status} />
            </TableCell>

            <TableCell className="whitespace-nowrap text-muted-foreground">
              {formatDateOnly(row.orderDate)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>

      {/*
        Totals cover everything the current filter matches, not just this
        page, and are segmented by currency because this app never converts
        between them. Cancelled orders are excluded — they routed no goods
        and earned nothing.
      */}
      {totals.length > 0 ? (
        <tfoot className="border-t bg-muted/40">
          {totals.map((total) => (
            <TableRow key={total.currency} className="hover:bg-transparent">
              <TableCell colSpan={4} className="text-sm text-muted-foreground">
                {totals.length > 1 ? `${total.currency} total` : "Total"}
                <span className="ml-2">
                  ({total.projects} project{total.projects === 1 ? "" : "s"}, excluding
                  cancelled)
                </span>
              </TableCell>
              <TableCell className="whitespace-nowrap text-right font-medium tabular-nums">
                <span className="mr-1 text-xs text-muted-foreground">{total.currency}</span>
                {formatMoneyPlain(total.orderValue, total.currency)}
              </TableCell>
              <TableCell />
              <TableCell className="whitespace-nowrap text-right font-semibold tabular-nums">
                {formatMoneyPlain(total.commission, total.currency)}
              </TableCell>
              <TableCell colSpan={2} />
            </TableRow>
          ))}
        </tfoot>
      ) : null}
    </TableShell>
  );
}
