import type { Metadata } from "next";
import { MailSettingsForm } from "./mail-settings-form";
import { BackLink } from "@/components/layout/back-link";
import { PageHeader } from "@/components/layout/page-header";
import { mailSettingsView } from "@/lib/mail/settings";

export const metadata: Metadata = { title: "Mail settings — Hide & Weave" };

/** Credentials are read per request; nothing here may be prerendered. */
export const dynamic = "force-dynamic";

export default async function MailSettingsPage() {
  const settings = await mailSettingsView();

  return (
    <>
      <BackLink href="/mail">Mail</BackLink>
      <PageHeader
        title="Mail settings"
        description="Which account bulk mailings are sent from. Saved here, so a deployed server never needs editing by hand."
      />

      {settings.source === "environment" ? (
        <p className="mb-6 max-w-xl rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          These details currently come from the <span className="font-mono text-xs">MAIL_*</span>{" "}
          environment variables. Saving here stores them in the app instead, and
          what you save takes precedence from then on.
        </p>
      ) : null}

      <MailSettingsForm settings={settings} />
    </>
  );
}
