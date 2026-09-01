import { TableLink } from "@/components/data-table/table-link";
import { SupplierTypeBadges } from "@/components/status-badge";
import { SortableHeader } from "@/components/data-table/sortable-header";
import { TableShell } from "@/components/data-table/table-shell";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { displayHost } from "@/lib/url";
import type { SupplierListRow } from "@/lib/suppliers/queries";
import type { ListParams, Pagination } from "@/lib/list-params";

const PATH = "/suppliers";

export function SuppliersTable({
  rows,
  pagination,
  params,
}: {
  rows: SupplierListRow[];
  pagination: Pagination;
  params: ListParams;
}) {
  return (
    <TableShell pagination={pagination} params={params} pathname={PATH} unit="suppliers">
      <TableHeader>
        <TableRow>
          <SortableHeader
            column="companyName"
            label="Company"
            params={params}
            pathname={PATH}
          />
          <TableHead>What they do</TableHead>
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
              <TableLink
                href={`/suppliers/${row.id}`}
              >
                {row.companyName}
              </TableLink>
            </TableCell>

            <TableCell>
              <SupplierTypeBadges types={row.types} />
            </TableCell>

            <TableCell className="max-w-[16ch] truncate text-muted-foreground">
              {row.contactPerson ?? "—"}
            </TableCell>

            <TableCell>
              {row.email ? (
                <a
                  href={`mailto:${row.email}`}
                  className="block max-w-[24ch] truncate"
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
    </TableShell>
  );
}
