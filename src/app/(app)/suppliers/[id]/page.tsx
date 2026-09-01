import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { parseSupplierTypes } from "@/lib/enums";
import { SupplierDetailsPanel, type SupplierDetailView } from "./supplier-details-panel";
import { SupplierProjects } from "./supplier-projects";
import { BackLink } from "@/components/layout/back-link";
import { PageHeader } from "@/components/layout/page-header";
import { getSupplier } from "@/lib/suppliers/queries";
import { displayHost } from "@/lib/url";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const supplier = await getSupplier((await params).id);
  return { title: supplier ? `${supplier.companyName} — Suppliers` : "Supplier not found" };
}

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supplier = await getSupplier(id);
  if (!supplier) notFound();

  const detail: SupplierDetailView = {
    id: supplier.id,
    companyName: supplier.companyName,
    types: parseSupplierTypes(supplier.types),
    website: supplier.website ?? "",
    contactPerson: supplier.contactPerson ?? "",
    email: supplier.email ?? "",
    phone: supplier.phone ?? "",
    address: supplier.address ?? "",
    sourceUrl: supplier.sourceUrl ?? "",
    notes: supplier.notes ?? "",
    projectCount: supplier.projects.length,
  };

  return (
    <>
      <BackLink href="/suppliers">All suppliers</BackLink>

      <PageHeader
        title={supplier.companyName}
        description={supplier.website ? displayHost(supplier.website) : undefined}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:items-start">
        <SupplierDetailsPanel supplier={detail} />
        <SupplierProjects projects={supplier.projects} />
      </div>
    </>
  );
}
