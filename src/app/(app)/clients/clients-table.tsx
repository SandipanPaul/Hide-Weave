import { TableLink } from "@/components/data-table/table-link";
import { SortableHeader } from "@/components/data-table/sortable-header";
import { TableShell } from "@/components/data-table/table-shell";
import { ClientStatusBadge } from "@/components/status-badge";
import {
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
    <TableShell pagination={pagination} params={params} pathname={PATH} unit="clients">
      <TableHeader>
        <TableRow>
          <SortableHeader column="name" label="Name" params={params} pathname={PATH} />
          {/* Beside the name on purpose: where a client stands is one of
              the first things you want, and as the last column it was the
              first thing cut off on a narrow screen. */}
          <SortableHeader column="status" label="Status" params={params} pathname={PATH} />
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
        </TableRow>
      </TableHeader>

      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            {/* The reference sits under the name rather than in a column
                of its own: this table already fills the width it has, and
                a ninth column put the last one off the screen. */}
            <TableCell className="max-w-[26ch] font-medium">
              <TableLink
                title={row.name}
                href={`/clients/${row.id}`}
                className="block truncate"
              >
                {row.name}
              </TableLink>
              {row.code ? (
                <span className="block font-mono text-xs font-normal text-muted-foreground">
                  {row.code}
                </span>
              ) : null}
            </TableCell>

            <TableCell>
              <ClientStatusBadge status={row.status} />
            </TableCell>

            <TableCell className="max-w-[14ch] truncate text-muted-foreground">
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
              <div className="flex max-w-[20ch] items-baseline gap-1.5">
                {row.emails[0] ? (
                  <a
                    href={`mailto:${row.emails[0]}`}
                    className="truncate"
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

          </TableRow>
        ))}
      </TableBody>
    </TableShell>
  );
}
