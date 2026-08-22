import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ExporterDetailsPanel, type ExporterDetailView } from "./exporter-details-panel";
import { ExporterProjects } from "./exporter-projects";
import { BackLink } from "@/components/layout/back-link";
import { PageHeader } from "@/components/layout/page-header";
import { getExporter } from "@/lib/exporters/queries";
import { displayHost } from "@/lib/url";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const exporter = await getExporter((await params).id);
  return { title: exporter ? `${exporter.companyName} — Exporters` : "Exporter not found" };
}

export default async function ExporterDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const exporter = await getExporter(id);
  if (!exporter) notFound();

  const detail: ExporterDetailView = {
    id: exporter.id,
    companyName: exporter.companyName,
    website: exporter.website ?? "",
    contactPerson: exporter.contactPerson ?? "",
    email: exporter.email ?? "",
    phone: exporter.phone ?? "",
    address: exporter.address ?? "",
    sourceUrl: exporter.sourceUrl ?? "",
    notes: exporter.notes ?? "",
    projectCount: exporter.projects.length,
  };

  return (
    <>
      <BackLink href="/exporters">All exporters</BackLink>

      <PageHeader
        title={exporter.companyName}
        description={exporter.website ? displayHost(exporter.website) : undefined}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:items-start">
        <ExporterDetailsPanel exporter={detail} />
        <ExporterProjects projects={exporter.projects} />
      </div>
    </>
  );
}
