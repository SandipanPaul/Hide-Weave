import type { Metadata } from "next";
import { Building2 } from "lucide-react";
import { AddSupplierDialog } from "./add-supplier-dialog";
import { SuppliersTable } from "./suppliers-table";
import { SearchInput } from "@/components/data-table/search-input";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { SUPPLIER_SORT_COLUMNS, getSuppliersPage, supplierTypeCounts } from "@/lib/suppliers/queries";
import { TypeFilter } from "./type-filter";
import { parseListParams, type RawSearchParams } from "@/lib/list-params";
import { rememberedSort } from "@/lib/sort-memory.server";
import { RememberSort } from "@/components/data-table/remember-sort";

export const metadata: Metadata = { title: "Suppliers — Hide & Weave" };

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  // Falls back to however this list was last sorted, so leaving the tab
  // and coming back does not undo it.
  const remembered = await rememberedSort("suppliers", SUPPLIER_SORT_COLUMNS, {
    sort: "companyName",
    dir: "asc",
  });
  const raw = await searchParams;
  const params = parseListParams(raw, {
    allowedSorts: SUPPLIER_SORT_COLUMNS,
    defaultSort: remembered.sort,
    defaultDir: remembered.dir,
  });

  const type = typeof raw.type === "string" ? raw.type : "ALL";
  const [{ rows, pagination }, typeCounts] = await Promise.all([
    getSuppliersPage({ ...params, type }),
    supplierTypeCounts(),
  ]);
  const isSearching = params.q.length > 0;

  return (
    <>
      <PageHeader
        title="Suppliers"
        description="Tanneries, exporters and factories — who fulfils each order."
        actions={<AddSupplierDialog />}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput
          placeholder="Search company, contact, email, website…"
          label="Search suppliers"
        />
        <TypeFilter current={type} counts={typeCounts} />
      </div>

      {rows.length === 0 ? (
        isSearching ? (
          <EmptyState
            icon={Building2}
            title={`No suppliers match “${params.q}”`}
            description="Try a shorter search, or clear it to see everyone."
          />
        ) : (
          <EmptyState
            icon={Building2}
            title="No suppliers yet"
            description="Add the suppliers who fulfil your orders, so you can record which one sourced each consignment."
            action={<AddSupplierDialog triggerLabel="Add your first supplier" />}
          />
        )
      ) : (
        <>
          <RememberSort scope="suppliers" sort={params.sort} dir={params.dir} />
          <SuppliersTable rows={rows} pagination={pagination} params={params} />
        </>
      )}
    </>
  );
}
