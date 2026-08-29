import type { Metadata } from "next";
import { ComposeForm } from "./compose-form";
import { MailNotConfigured } from "../mail-not-configured";
import { BackLink } from "@/components/layout/back-link";
import { PageHeader } from "@/components/layout/page-header";
import { getMailableClients } from "@/lib/mail/queries";
import { isMailConfigured, mailSettingsView } from "@/lib/mail/settings";

export const metadata: Metadata = { title: "New mailing — Hide & Weave" };

/**
 * Read on every request, never prerendered. Nothing on this page touches a
 * request API, so without this Next would build the client list once and serve
 * a frozen copy of it — a client added afterwards would be unmailable until
 * the next deploy.
 */
export const dynamic = "force-dynamic";

export default async function NewCampaignPage() {
  // The cheap check decides whether the form is usable; the view only supplies
  // the address to name in the description.
  const [configured, settings, clients] = await Promise.all([
    isMailConfigured(),
    mailSettingsView(),
    getMailableClients(),
  ]);

  return (
    <>
      <BackLink href="/mail">Mail</BackLink>
      <PageHeader
        title="New mailing"
        description={
          configured
            ? `Sent one at a time from ${settings.user}, so each client sees a message written to them.`
            : undefined
        }
      />

      {/* Rendered even with no mailable clients: a mailing can go entirely to
          addresses typed in by hand, so hiding the form would hide the only way
          to send one. */}
      {configured ? <ComposeForm clients={clients} /> : <MailNotConfigured />}
    </>
  );
}
