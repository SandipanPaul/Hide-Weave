import Link from "next/link";
import { KeyRound, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Shown wherever mail would be sent but cannot be.
 *
 * The app deliberately starts and runs without mail credentials — every other
 * tab is unaffected by them — so this explains what is missing and links to the
 * page that fixes it, rather than letting a send fail with an SMTP error
 * nobody can act on.
 */
export function MailNotConfigured() {
  return (
    <div className="max-w-2xl rounded-lg border border-dashed p-6">
      <div className="flex items-start gap-3">
        <KeyRound className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="space-y-3 text-sm">
          <p className="font-medium">Mail is not set up yet</p>
          <p className="text-muted-foreground">
            Mailings go out through your own Gmail or Yahoo account, so replies
            come back to you and a copy lands in your Sent folder.
          </p>
          <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
            <li>Choose whether you send from Gmail or Yahoo.</li>
            <li>
              Create an app password for that account. Both providers require
              one; your normal password will not work.
            </li>
            <li>Enter it on the settings page, and send yourself a test.</li>
          </ol>
          <p className="text-muted-foreground">
            Personal accounts cap the day&rsquo;s sending at around 500 messages.
          </p>
          <Button nativeButton={false} render={<Link href="/mail/settings" />}>
            <Settings className="size-4" aria-hidden />
            Set up mail
          </Button>
        </div>
      </div>
    </div>
  );
}
