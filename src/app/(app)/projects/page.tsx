import type { Metadata } from "next";
import Link from "next/link";
import { FolderKanban, Users } from "lucide-react";
import { AddProjectDialog } from "./add-project-dialog";
import { ProjectCsvImport } from "./project-csv-import";
import { ProjectsFilters } from "./projects-filters";
import { ProjectsTable } from "./projects-table";
import { SearchInput } from "@/components/data-table/search-input";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import {
  getProjectCurrencies,
  getProjectFormOptions,
  getProjectsPage,
  PROJECT_FILTER_KEYS,
  PROJECT_SORT_COLUMNS,
} from "@/lib/projects/queries";
import { parseListParams, type RawSearchParams } from "@/lib/list-params";
import { rememberedSort } from "@/lib/sort-memory.server";
import { RememberSort } from "@/components/data-table/remember-sort";

export const metadata: Metadata = { title: "Projects — Hide & Weave" };

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  // Falls back to however this list was last sorted, so leaving the tab
  // and coming back does not undo it.
  const remembered = await rememberedSort("projects", PROJECT_SORT_COLUMNS, {
    sort: "orderDate",
    dir: "desc",
  });
  const params = parseListParams(await searchParams, {
    allowedSorts: PROJECT_SORT_COLUMNS,
    defaultSort: remembered.sort,
    defaultDir: remembered.dir,
    filterKeys: PROJECT_FILTER_KEYS,
  });

  const [{ rows, pagination, totals }, options, currencies] = await Promise.all([
    getProjectsPage(params),
    getProjectFormOptions(),
    getProjectCurrencies(),
  ]);

  const narrowed = params.q.length > 0 || Object.keys(params.filters).length > 0;

  // A project needs a client, so with none on file the useful action is to add
  // one rather than to open a form that cannot be completed.
  if (options.clients.length === 0) {
    return (
      <>
        <PageHeader
          title="Projects"
          description="Orders routed through you, and the commission each one earns."
        />
        <EmptyState
          icon={Users}
          title="Add a client first"
          description="Every order belongs to a client, so there is nobody to record one against yet."
          action={
            <Button nativeButton={false} render={<Link href="/clients" />}>
              Go to Clients
            </Button>
          }
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Projects"
        description="Orders routed through you, and the commission each one earns."
        actions={
          <>
            <ProjectCsvImport options={options} />
            <AddProjectDialog options={options} />
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput
          placeholder="Search order ID, product, client…"
          label="Search projects"
        />
      </div>

      <ProjectsFilters params={params} clients={options.clients} currencies={currencies} />

      {rows.length === 0 ? (
        narrowed ? (
          <EmptyState
            icon={FolderKanban}
            title="No projects match these filters"
            description="Try widening the date range, clearing a filter, or shortening the search."
          />
        ) : (
          <EmptyState
            icon={FolderKanban}
            title="No projects yet"
            description="Record your first order to start tracking the commission it earns."
            action={<AddProjectDialog options={options} triggerLabel="Add your first project" />}
          />
        )
      ) : (
        <>
          <RememberSort scope="projects" sort={params.sort} dir={params.dir} />
          <ProjectsTable rows={rows} pagination={pagination} params={params} totals={totals} />
        </>
      )}
    </>
  );
}
