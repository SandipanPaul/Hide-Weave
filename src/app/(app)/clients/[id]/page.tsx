import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ClientDetailsPanel, type ClientDetailView } from "./client-details-panel";
import { ClientProjects } from "./client-projects";
import { RetainerSection, type RetainerReceiptView } from "./retainer-section";
import { SamplingsSection, type SamplingView } from "./samplings-section";
import { BackLink } from "@/components/layout/back-link";
import { PageHeader } from "@/components/layout/page-header";
import {
  getClient,
  getClientProjects,
  getClientRetainerReceipts,
  getClientSamplings,
  groupContacts,
} from "@/lib/clients/queries";
import { formatDateOnly, todayUtc, utcToDateOnly } from "@/lib/dates";
import { countryName } from "@/lib/countries";
import type { SamplingStatus } from "@/lib/enums";
import { formatMoney, minorToMajorString } from "@/lib/money";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const client = await getClient((await params).id);
  return { title: client ? `${client.name} — Clients` : "Client not found" };
}

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const client = await getClient(id);
  if (!client) notFound();

  const [samplings, projects, retainerReceipts] = await Promise.all([
    getClientSamplings(id),
    getClientProjects(id),
    getClientRetainerReceipts(id),
  ]);

  const today = todayUtc();
  const views: SamplingView[] = samplings.map((sampling) => ({
    id: sampling.id,
    // Serialised as a plain calendar day so the browser can't shift it a day.
    scheduledDate: utcToDateOnly(sampling.scheduledDate),
    displayDate: formatDateOnly(sampling.scheduledDate),
    product: sampling.product,
    status: sampling.status as SamplingStatus,
    notes: sampling.notes,
    isPast: sampling.scheduledDate < today,
  }));

  // Upcoming means still scheduled and not yet in the past — a completed or
  // cancelled sampling is history even if its date has not arrived.
  const upcoming = views
    .filter((view) => !view.isPast && view.status === "SCHEDULED")
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
  const past = views
    .filter((view) => view.isPast || view.status !== "SCHEDULED")
    .sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate));

  const detail: ClientDetailView = {
    id: client.id,
    code: client.code,
    name: client.name,
    address: client.address ?? "",
    // The form shows the readable name; the resolver turns it back into a code.
    country: countryName(client.country),
    ...groupContacts(client.contacts),
    website: client.website ?? "",
    contactPerson: client.contactPerson ?? "",
    status: client.status,
    // The edit form wants a plain editable number; the read view wants it
    // formatted with its currency.
    fixedMonthly:
      client.fixedMonthly === null ? "" : minorToMajorString(client.fixedMonthly, client.currency),
    currency: client.currency,
    notes: client.notes ?? "",
    retainerDisplay:
      client.fixedMonthly === null
        ? null
        : `${formatMoney(client.fixedMonthly, client.currency)} / month`,
  };

  const retainerViews: RetainerReceiptView[] = retainerReceipts.map((receipt) => ({
    id: receipt.id,
    amountDisplay: formatMoney(receipt.amount, receipt.currency),
    displayDate: formatDateOnly(receipt.paidOn),
  }));
  const retainerTotal = retainerReceipts.reduce((total, r) => total + r.amount, 0n);

  return (
    <>
      <BackLink href="/clients">All clients</BackLink>

      <PageHeader
        title={client.name}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {client.code ? (
              <span className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                {client.code}
              </span>
            ) : null}
            {client.contactPerson ? <span>Contact: {client.contactPerson}</span> : null}
          </span>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
        <ClientDetailsPanel client={detail} />

        <div className="space-y-6">
          <RetainerSection
            clientId={client.id}
            rateDisplay={
              client.fixedMonthly === null
                ? null
                : formatMoney(client.fixedMonthly, client.currency)
            }
            receipts={retainerViews}
            totalDisplay={formatMoney(retainerTotal, client.currency)}
          />
          <SamplingsSection clientId={client.id} upcoming={upcoming} past={past} />
          <ClientProjects projects={projects} />
        </div>
      </div>
    </>
  );
}
