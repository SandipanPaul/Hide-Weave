import type { Metadata } from "next";
import { Users } from "lucide-react";
import { AddClientDialog } from "./add-client-dialog";
import { ClientCsvImport } from "./client-csv-import";
import { ClientsTable } from "./clients-table";
import { SearchInput } from "@/components/data-table/search-input";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { CLIENT_SORT_COLUMNS, getClientsPage } from "@/lib/clients/queries";
import { parseListParams, type RawSearchParams } from "@/lib/list-params";
import { rememberedSort } from "@/lib/sort-memory.server";
import { RememberSort } from "@/components/data-table/remember-sort";

export const metadata: Metadata = { title: "Clients — Hide & Weave" };

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  // Falls back to however this list was last sorted, so leaving the tab
  // and coming back does not undo it.
  const remembered = await rememberedSort("clients", CLIENT_SORT_COLUMNS, {
    sort: "name",
    dir: "asc",
  });
  const params = parseListParams(await searchParams, {
    allowedSorts: CLIENT_SORT_COLUMNS,
    defaultSort: remembered.sort,
    defaultDir: remembered.dir,
  });

  const { rows, pagination } = await getClientsPage(params);
  const isSearching = params.q.length > 0;

  return (
    <>
      <PageHeader
        title="Clients"
        description="Everyone who places orders through you."
        actions={
          <>
            <ClientCsvImport />
            <AddClientDialog />
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput
          placeholder="Search name, email, phone, country…"
          label="Search clients"
        />
      </div>

      {rows.length === 0 ? (
        isSearching ? (
          <EmptyState
            icon={Users}
            title={`No clients match “${params.q}”`}
            description="Try a shorter search, or clear it to see everyone."
          />
        ) : (
          <EmptyState
            icon={Users}
            title="No clients yet"
            description="Add your first client to start recording orders and commission against them."
            action={<AddClientDialog triggerLabel="Add your first client" />}
          />
        )
      ) : (
        <>
          <RememberSort scope="clients" sort={params.sort} dir={params.dir} />
          <ClientsTable rows={rows} pagination={pagination} params={params} />
        </>
      )}
    </>
  );
}
