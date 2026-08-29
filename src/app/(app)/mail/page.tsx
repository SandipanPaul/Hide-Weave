import type { Metadata } from "next";
import Link from "next/link";
import { Mail, Plus, Settings } from "lucide-react";
import { CampaignsTable } from "./campaigns-table";
import { MailNotConfigured } from "./mail-not-configured";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { getCampaigns } from "@/lib/mail/queries";
import { isMailConfigured } from "@/lib/mail/settings";

export const metadata: Metadata = { title: "Mail — Hide & Weave" };

/** The list refreshes on its own while something is sending. */
export const dynamic = "force-dynamic";

function NewMailingButton({ label = "New mailing" }: { label?: string }) {
  return (
    <Button nativeButton={false} render={<Link href="/mail/new" />}>
      <Plus className="size-4" aria-hidden />
      {label}
    </Button>
  );
}

export default async function MailPage() {
  const [configured, campaigns] = await Promise.all([isMailConfigured(), getCampaigns()]);

  return (
    <>
      <PageHeader
        title="Mail"
        description="Write to a group of clients at once, each one personally."
        actions={
          <>
            {/* Reachable whether or not mail is configured — it is the page
                that makes it configured. */}
            <Button variant="outline" nativeButton={false} render={<Link href="/mail/settings" />}>
              <Settings className="size-4" aria-hidden />
              Settings
            </Button>
            {configured ? <NewMailingButton /> : null}
          </>
        }
      />

      {!configured ? (
        <MailNotConfigured />
      ) : campaigns.length === 0 ? (
        <EmptyState
          icon={Mail}
          title="Nothing sent yet"
          description="Write one message, choose who it goes to, and each client receives their own copy addressed to them."
          action={<NewMailingButton label="Write your first mailing" />}
        />
      ) : (
        <CampaignsTable rows={campaigns} />
      )}
    </>
  );
}
