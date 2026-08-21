import Link from "next/link";
import { PaginationBar } from "@/components/data-table/pagination";
import { SortableHeader } from "@/components/data-table/sortable-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { displayHost } from "@/lib/url";
import type { ExporterListRow } from "@/lib/exporters/queries";
import type { ListParams, Pagination } from "@/lib/list-params";

const PATH = "/exporters";

export function ExportersTable({
  rows,
  pagination,
  params,
}: {
  rows: ExporterListRow[];
  pagination: Pagination;
  params: ListParams;
}) {
  return (
    <div className="rounded-lg border">
      {/* Narrow screens scroll the table rather than squashing the columns. */}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHeader
                column="companyName"
                label="Company"
                params={params}
                pathname={PATH}
              />
              <SortableHeader
                column="contactPerson"
                label="Contact person"
                params={params}
                pathname={PATH}
              />
              <SortableHeader column="email" label="Email" params={params} pathname={PATH} />
              <SortableHeader column="phone" label="Phone" params={params} pathname={PATH} />
              <SortableHeader column="website" label="Website" params={params} pathname={PATH} />
              <SortableHeader
                column="projects"
                label="Projects"
                params={params}
                pathname={PATH}
                naturalDir="desc"
                align="right"
              />
            </TableRow>
          </TableHeader>

          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">
                  <Link
                    href={`/exporters/${row.id}`}
                    className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {row.companyName}
                  </Link>
                </TableCell>

                <TableCell className="max-w-[16ch] truncate text-muted-foreground">
                  {row.contactPerson ?? "—"}
                </TableCell>

                <TableCell>
                  {row.email ? (
                    <a
                      href={`mailto:${row.email}`}
                      className="block max-w-[24ch] truncate rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {row.email}
                    </a>
                  ) : (
                    "—"
                  )}
                </TableCell>

                <TableCell className="whitespace-nowrap">{row.phone ?? "—"}</TableCell>

                <TableCell>
                  {row.website ? (
                    // The bare domain is what identifies the supplier; the
                    // scheme and "www." are noise in a table.
                    <a
                      href={row.website}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {displayHost(row.website)}
                    </a>
                  ) : (
                    "—"
                  )}
                </TableCell>

                <TableCell className="text-right tabular-nums">
                  {row.projectCount > 0 ? (
                    row.projectCount
                  ) : (
                    <span className="text-muted-foreground">0</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <PaginationBar pagination={pagination} params={params} pathname={PATH} unit="exporters" />
    </div>
  );
}
