import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CommissionSummary } from "./commission-summary";
import { PaymentsSection, type PaymentView } from "./payments-section";
import { ProjectDetailsPanel, type ProjectDetailView } from "./project-details-panel";
import { BackLink } from "@/components/layout/back-link";
import { PageHeader } from "@/components/layout/page-header";
import { formatDateOnly, utcToDateOnly } from "@/lib/dates";
import { formatMoney, minorToMajorString } from "@/lib/money";
import { getProject, getProjectFormOptions } from "@/lib/projects/queries";
import { runningBalances } from "@/lib/projects/ledger";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const project = await getProject((await params).id);
  return { title: project ? `${project.orderId} — Projects` : "Project not found" };
}

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const project = await getProject(id);
  if (!project) notFound();

  const options = await getProjectFormOptions();
  const { ledger, currency } = project;
  const money = (minor: bigint) => formatMoney(minor, currency);

  // The balance owed after each payment, in the order they arrived.
  const balances = runningBalances(ledger.commission, project.payments);
  const payments: PaymentView[] = project.payments.map((payment, index) => ({
    id: payment.id,
    paidOn: utcToDateOnly(payment.paidOn),
    displayDate: formatDateOnly(payment.paidOn),
    amountDisplay: money(payment.amount),
    amountInput: minorToMajorString(payment.amount, currency),
    balanceDisplay: money(balances[index]),
    method: payment.method,
    notes: payment.notes,
  }));

  const detail: ProjectDetailView = {
    id: project.id,
    clientId: project.clientId,
    clientName: project.client.name,
    exporterId: project.exporterId ?? "",
    exporterName: project.exporter?.companyName ?? null,
    product: project.product,
    orderId: project.orderId,
    quantity: String(project.quantity),
    unit: project.unit,
    // The edit form wants a plain editable number; the read view wants it
    // formatted with its currency.
    orderValue: minorToMajorString(project.orderValue, currency),
    orderValueDisplay: money(project.orderValue),
    commissionPercentage: String(project.commissionPercentage),
    currency,
    status: project.status,
    orderDate: utcToDateOnly(project.orderDate),
    orderDateDisplay: formatDateOnly(project.orderDate),
    expectedDelivery: project.expectedDelivery ? utcToDateOnly(project.expectedDelivery) : "",
    expectedDeliveryDisplay: project.expectedDelivery
      ? formatDateOnly(project.expectedDelivery)
      : null,
    actualDelivery: project.actualDelivery ? utcToDateOnly(project.actualDelivery) : "",
    actualDeliveryDisplay: project.actualDelivery ? formatDateOnly(project.actualDelivery) : null,
    notes: project.notes ?? "",
  };

  return (
    <>
      <BackLink href="/projects">All projects</BackLink>

      <PageHeader
        title={project.orderId}
        description={`${project.product} for ${project.client.name}`}
      />

      <div className="space-y-6">
        <CommissionSummary
          commissionDisplay={money(ledger.commission)}
          orderValueDisplay={money(project.orderValue)}
          commissionPercentage={project.commissionPercentage}
          paidDisplay={money(ledger.paid)}
          outstandingDisplay={money(ledger.outstanding)}
          overpaidDisplay={ledger.overpaid > 0n ? money(ledger.overpaid) : null}
          percentPaid={ledger.percentPaid}
          settled={ledger.settled}
        />

        <div className="grid gap-6 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:items-start">
          <ProjectDetailsPanel project={detail} options={options} />
          <PaymentsSection
            projectId={project.id}
            currency={currency}
            payments={payments}
            outstandingInput={minorToMajorString(ledger.outstanding, currency)}
            settled={ledger.settled}
          />
        </div>
      </div>
    </>
  );
}
