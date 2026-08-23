import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CommissionSummary } from "./commission-summary";
import { ExpensesSection } from "./expenses-section";
import { PaymentsSection, type PaymentView } from "./payments-section";
import { ProjectDetailsPanel, type ProjectDetailView } from "./project-details-panel";
import type { ExpenseView } from "@/components/expenses/expense-form";
import { BackLink } from "@/components/layout/back-link";
import { PageHeader } from "@/components/layout/page-header";
import { formatDateOnly, utcToDateOnly } from "@/lib/dates";
import { EXPENSE_CATEGORY_LABELS, type ExpenseCategory } from "@/lib/enums";
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

  const expenses: ExpenseView[] = project.expenses.map((expense) => ({
    id: expense.id,
    incurredOn: utcToDateOnly(expense.incurredOn),
    displayDate: formatDateOnly(expense.incurredOn),
    description: expense.description,
    amountDisplay: money(expense.amount),
    amountInput: minorToMajorString(expense.amount, currency),
    category: expense.category ?? "",
    categoryLabel: expense.category
      ? (EXPENSE_CATEGORY_LABELS[expense.category as ExpenseCategory] ?? expense.category)
      : null,
    notes: expense.notes,
    projectId: project.id,
    // The order already names the client, so a spend on it is not offered the
    // picker and carries no separate attribution.
    clientId: expense.clientId ?? "",
    clientName: null,
  }));

  const detail: ProjectDetailView = {
    id: project.id,
    clientId: project.clientId,
    clientName: project.client.name,
    exporters: project.exporters.map((allocation) => ({
      exporterId: allocation.exporter.id,
      quantity: String(allocation.quantity),
    })),
    exporterNames: project.exporters.map((allocation) => ({
      id: allocation.exporter.id,
      name: allocation.exporter.companyName,
      quantity: allocation.quantity,
    })),
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
          expensesDisplay={ledger.expenses > 0n ? money(ledger.expenses) : null}
          netDisplay={money(ledger.net)}
        />

        <div className="grid gap-6 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:items-start">
          <ProjectDetailsPanel project={detail} options={options} />

          <div className="space-y-6">
            <PaymentsSection
              projectId={project.id}
              currency={currency}
              payments={payments}
              outstandingInput={minorToMajorString(ledger.outstanding, currency)}
              settled={ledger.settled}
            />
            <ExpensesSection
              projectId={project.id}
              currency={currency}
              expenses={expenses}
              totalDisplay={money(ledger.expenses)}
              netDisplay={money(ledger.net)}
              commissionDisplay={money(ledger.commission)}
            />
          </div>
        </div>
      </div>
    </>
  );
}
