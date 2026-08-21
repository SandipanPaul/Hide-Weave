import Link from "next/link";
import { PaginationBar } from "@/components/data-table/pagination";
import { SortableHeader } from "@/components/data-table/sortable-header";
import { ClientStatusBadge } from "@/components/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { countryName } from "@/lib/countries";
import { formatDateOnly } from "@/lib/dates";
import type { ClientListRow } from "@/lib/clients/queries";
import type { ListParams, Pagination } from "@/lib/list-params";

const PATH = "/clients";

export function ClientsTable({
  rows,
  pagination,
  params,
}: {
  rows: ClientListRow[];
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
              <SortableHeader column="name" label="Name" params={params} pathname={PATH} />
              <TableHead>Address</TableHead>
              <SortableHeader column="country" label="Country" params={params} pathname={PATH} />
              <SortableHeader column="phone" label="Phone" params={params} pathname={PATH} />
              <SortableHeader column="email" label="Email" params={params} pathname={PATH} />
              <SortableHeader
                column="openProjects"
                label="Open projects"
                params={params}
                pathname={PATH}
                naturalDir="desc"
              />
              <SortableHeader
                column="nextSampling"
                label="Next sampling"
                params={params}
                pathname={PATH}
              />
              <SortableHeader column="status" label="Status" params={params} pathname={PATH} />
            </TableRow>
          </TableHeader>

          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">
                  <Link
                    href={`/clients/${row.id}`}
                    className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {row.name}
                  </Link>
                </TableCell>

                <TableCell className="max-w-[22ch] truncate text-muted-foreground">
                  {row.address ?? "—"}
                </TableCell>

                <TableCell className="whitespace-nowrap">
                  {row.country ? countryName(row.country) : "—"}
                </TableCell>

                {/* The primary value, with a count of the rest — the full list
                    is on the client's own page. */}
                <TableCell className="whitespace-nowrap">
                  {row.phones[0] ?? "—"}
                  {row.phones.length > 1 ? (
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      +{row.phones.length - 1}
                    </span>
                  ) : null}
                </TableCell>

                <TableCell>
                  <div className="flex max-w-[26ch] items-baseline gap-1.5">
                    {row.emails[0] ? (
                      <a
                        href={`mailto:${row.emails[0]}`}
                        className="truncate rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {row.emails[0]}
                      </a>
                    ) : (
                      "—"
                    )}
                    {row.emails.length > 1 ? (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        +{row.emails.length - 1}
                      </span>
                    ) : null}
                  </div>
                </TableCell>

                <TableCell className="tabular-nums">
                  {row.openProjectCount > 0 ? (
                    row.openProjectCount
                  ) : (
                    <span className="text-muted-foreground">0</span>
                  )}
                </TableCell>

                <TableCell className="whitespace-nowrap">
                  {row.nextSamplingDate ? formatDateOnly(row.nextSamplingDate) : "—"}
                </TableCell>

                <TableCell>
                  <ClientStatusBadge status={row.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <PaginationBar
        pagination={pagination}
        params={params}
        pathname={PATH}
        unit="clients"
      />
    </div>
  );
}
