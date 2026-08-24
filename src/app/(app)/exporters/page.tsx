import type { Metadata } from "next";
import { Building2 } from "lucide-react";
import { AddExporterDialog } from "./add-exporter-dialog";
import { ExportersTable } from "./exporters-table";
import { SearchInput } from "@/components/data-table/search-input";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { EXPORTER_SORT_COLUMNS, getExportersPage } from "@/lib/exporters/queries";
import { parseListParams, type RawSearchParams } from "@/lib/list-params";
import { rememberedSort } from "@/lib/sort-memory.server";
import { RememberSort } from "@/components/data-table/remember-sort";

export const metadata: Metadata = { title: "Exporters — Hide & Weave" };

export default async function ExportersPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  // Falls back to however this list was last sorted, so leaving the tab
  // and coming back does not undo it.
  const remembered = await rememberedSort("exporters", EXPORTER_SORT_COLUMNS, {
    sort: "companyName",
    dir: "asc",
  });
  const params = parseListParams(await searchParams, {
    allowedSorts: EXPORTER_SORT_COLUMNS,
    defaultSort: remembered.sort,
    defaultDir: remembered.dir,
  });

  const { rows, pagination } = await getExportersPage(params);
  const isSearching = params.q.length > 0;

  return (
    <>
      <PageHeader
        title="Exporters"
        description="The supply side — who fulfils each order."
        actions={<AddExporterDialog />}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput
          placeholder="Search company, contact, email, website…"
          label="Search exporters"
        />
      </div>

      {rows.length === 0 ? (
        isSearching ? (
          <EmptyState
            icon={Building2}
            title={`No exporters match “${params.q}”`}
            description="Try a shorter search, or clear it to see everyone."
          />
        ) : (
          <EmptyState
            icon={Building2}
            title="No exporters yet"
            description="Add the suppliers who fulfil your orders, so you can record which one sourced each consignment."
            action={<AddExporterDialog triggerLabel="Add your first exporter" />}
          />
        )
      ) : (
        <>
          <RememberSort scope="exporters" sort={params.sort} dir={params.dir} />
          <ExportersTable rows={rows} pagination={pagination} params={params} />
        </>
      )}
    </>
  );
}
