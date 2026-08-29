"use client";

import { startTransition, useActionState, useMemo, useState } from "react";
import { Loader2, Paperclip, Send, TriangleAlert } from "lucide-react";
import { createCampaign } from "../actions";
import { AttachmentPicker } from "./attachment-picker";
import { RecipientPicker } from "./recipient-picker";
import { FormErrors } from "@/components/form/form-errors";
import { TextAreaField, TextField } from "@/components/form/fields";
import { parseExtraRecipients, withoutClientAddresses } from "@/lib/mail/recipients";
import { checkAttachments } from "@/lib/mail/attachments";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { hasPlaceholder, NAME_PLACEHOLDER, renderBody } from "@/lib/mail/template";
import type { MailableClient } from "@/lib/mail/queries";
import type { ActionResult } from "@/lib/schemas";

/**
 * Writing one mailing and choosing who gets it.
 *
 * The preview is not decoration. This is the only screen in the app whose
 * button does something that cannot be undone or corrected afterwards, so the
 * user sees a real recipient's copy — their name substituted, their address —
 * before the confirm dialog, and the dialog states the number out loud.
 */
export function ComposeForm({ clients }: { clients: MailableClient[] }) {
  const [state, formAction, pending] = useActionState<
    ActionResult<{ id: string }> | null,
    FormData
  >(createCampaign, null);

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [extraEmails, setExtraEmails] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [cc, setCc] = useState("");
  const [confirming, setConfirming] = useState(false);

  const chosen = useMemo(
    () => clients.filter((client) => selected.has(client.id)),
    [clients, selected],
  );

  // Parsed as it is typed, with the same function the server will use, so what
  // is listed here is exactly who gets written to.
  const extras = useMemo(() => {
    const { recipients, invalid } = parseExtraRecipients(extraEmails);
    const kept = withoutClientAddresses(
      recipients,
      chosen.map((client) => client.email),
    );
    return { recipients: kept, invalid, duplicates: recipients.length - kept.length };
  }, [extraEmails, chosen]);

  const copies = useMemo(() => parseExtraRecipients(cc), [cc]);

  const total = chosen.length + extras.recipients.length;

  // Previewed against the first recipient in the order they will be written to,
  // so the preview is somebody's actual mail rather than a made-up example.
  const sample =
    chosen[0] ??
    (extras.recipients[0]
      ? {
          name: extras.recipients[0].label,
          email: extras.recipients[0].email,
          greeting: extras.recipients[0].greeting,
        }
      : undefined);
  const errors = state?.ok === false ? state : null;
  const personalised = hasPlaceholder(body);
  // Checked once and passed down: the picker shows the problems and the Send
  // button is disabled by them, and two calls could not disagree but could
  // drift.
  const attachments = useMemo(() => checkAttachments(files), [files]);

  /**
   * Builds the submission by hand rather than letting the browser collect it
   * from inputs.
   *
   * Everything on this screen already lives in React state, and two things do
   * not survive the DOM route: files cannot be put back into a file input once
   * removed, and the confirm button renders inside a portal, so it is not a
   * descendant of any form and a native submit does nothing at all.
   */
  const send = () => {
    const data = new FormData();
    data.set("subject", subject);
    data.set("body", body);
    for (const client of chosen) data.append("clientId", client.id);
    data.set("extraEmails", extraEmails);
    data.set("cc", cc);
    for (const file of files) data.append("attachment", file);
    startTransition(() => formAction(data));
  };
  const ready =
    subject.trim() !== "" &&
    body.trim() !== "" &&
    total > 0 &&
    extras.invalid.length === 0 &&
    copies.invalid.length === 0 &&
    attachments.problems.length === 0;

  return (
    <div className="space-y-6">
      {errors ? <FormErrors errors={errors.formErrors} /> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-4">
          <TextField
            label="Subject"
            name="subject"
            value={subject}
            onValueChange={setSubject}
            required
            error={errors?.fieldErrors.subject?.[0]}
            placeholder="Leather goods — spring collection"
          />

          <TextField
            label="Copy to (CC)"
            name="cc"
            value={cc}
            onValueChange={setCc}
            error={errors?.fieldErrors.cc?.[0]}
            hint={
              copies.recipients.length > 0
                ? `Copied on all ${total} message${total === 1 ? "" : "s"}, so this address receives ${total} ${total === 1 ? "email" : "emails"}. Every client can see it.`
                : "Optional. Anyone here is copied on every message and is visible to the client."
            }
            placeholder="colleague@example.com"
          />

          {copies.invalid.length > 0 ? (
            <p role="alert" className="text-sm text-destructive">
              Not an email address: {copies.invalid.join(", ")}
            </p>
          ) : null}

          <TextAreaField
            label="Message"
            name="body"
            value={body}
            onValueChange={setBody}
            required
            rows={14}
            error={errors?.fieldErrors.body?.[0]}
            hint={`Write ${NAME_PLACEHOLDER} where each client's name should go. Everything else is sent exactly as typed.`}
            placeholder={`Dear ${NAME_PLACEHOLDER},\n\nI hope this finds you well.\n\n…`}
          />

          {body.trim() !== "" && !personalised ? (
            <p className="flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                No {NAME_PLACEHOLDER} in the message, so every client receives it
                word for word. That is fine if you meant it.
              </span>
            </p>
          ) : null}

          <AttachmentPicker
            files={files}
            onFilesChange={setFiles}
            checked={attachments}
            recipientCount={total}
            error={errors?.fieldErrors.attachments?.[0]}
          />

          <Preview subject={subject} body={body} cc={cc} sample={sample} files={files} />
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Recipients</p>
          {errors?.fieldErrors.clientIds?.[0] ? (
            <p className="text-sm text-destructive">{errors.fieldErrors.clientIds[0]}</p>
          ) : null}
          <RecipientPicker
            clients={clients}
            selected={selected}
            onSelectedChange={setSelected}
          />

          <ExtraRecipients
            value={extraEmails}
            onValueChange={setExtraEmails}
            parsed={extras}
            error={errors?.fieldErrors.extraEmails?.[0]}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        <AlertDialog open={confirming} onOpenChange={setConfirming}>
          <AlertDialogTrigger
            render={<Button type="button" disabled={!ready} />}
          >
            <Send className="size-4" aria-hidden />
            Send to {total} {total === 1 ? "recipient" : "recipients"}
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Send this to {total} {total === 1 ? "recipient" : "recipients"}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Each one gets their own copy, one at a time, from your own email
                address{files.length > 0
                  ? `, with ${files.length} ${files.length === 1 ? "file" : "files"} attached`
                  : ""}. Mail that has gone cannot be called back.
                {chosen.length > 0
                  ? " Clients who are not already active will be marked as chasing."
                  : ""}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Not yet</AlertDialogCancel>
              {/* Closing first puts any error the action returns on the page
                  rather than behind a modal. */}
              <Button
                type="button"
                disabled={pending}
                onClick={() => {
                  setConfirming(false);
                  send();
                }}
              >
                {pending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Queueing…
                  </>
                ) : (
                  "Send now"
                )}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <p className="text-sm text-muted-foreground">
          {ready
            ? "Sends take about a second each — you can watch the progress."
            : extras.invalid.length > 0 || copies.invalid.length > 0
              ? "Fix the addresses that could not be read."
              : attachments.problems.length > 0
                ? "Fix the attachments before sending."
                : "Add a subject, a message, and at least one recipient."}
        </p>
      </div>
    </div>
  );
}

/** One recipient's copy, rendered with the same code the sender uses. */
function Preview({
  subject,
  body,
  cc,
  sample,
  files,
}: {
  subject: string;
  body: string;
  cc: string;
  sample: Pick<MailableClient, "name" | "email" | "greeting"> | undefined;
  files: File[];
}) {
  if (!sample) {
    return (
      <div className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
        Choose a recipient to preview their copy.
      </div>
    );
  }

  return (
    <div className="rounded-lg border">
      <div className="border-b bg-muted/40 px-4 py-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Preview — {sample.name}&rsquo;s copy
        </p>
      </div>
      <dl className="space-y-1 border-b px-4 py-3 text-sm">
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 text-muted-foreground">To</dt>
          <dd className="min-w-0 break-all">{sample.email}</dd>
        </div>
        {cc.trim() !== "" ? (
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 text-muted-foreground">Cc</dt>
            <dd className="min-w-0 break-all">{cc}</dd>
          </div>
        ) : null}
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 text-muted-foreground">Subject</dt>
          <dd className="min-w-0">
            {renderBody(subject, sample.greeting) || (
              <span className="text-muted-foreground">(no subject)</span>
            )}
          </dd>
        </div>
      </dl>
      <p className="whitespace-pre-wrap px-4 py-3 text-sm">
        {renderBody(body, sample.greeting) || (
          <span className="text-muted-foreground">(empty message)</span>
        )}
      </p>

      {files.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-t px-4 py-2 text-xs text-muted-foreground">
          <Paperclip className="size-3" aria-hidden />
          {files.map((file) => (
            <span key={`${file.name}:${file.size}`} className="rounded bg-muted px-1.5 py-0.5">
              {file.name}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Addresses typed in by hand, for people who are not clients.
 *
 * Shows what it made of them as they are typed — the address, the name it will
 * use, and anything it could not read. Sending is blocked while something is
 * unreadable rather than skipping it quietly, because a mistyped address that
 * is silently dropped means someone simply never hears from you.
 */
function ExtraRecipients({
  value,
  onValueChange,
  parsed,
  error,
}: {
  value: string;
  onValueChange: (value: string) => void;
  parsed: {
    recipients: { email: string; greeting: string; label: string; greetingGuessed: boolean }[];
    invalid: string[];
    duplicates: number;
  };
  error?: string;
}) {
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <TextAreaField
        label="Also send to"
        name="extraEmailsVisible"
        value={value}
        onValueChange={onValueChange}
        rows={3}
        error={error}
        hint="Addresses that are not clients, separated by commas or new lines. Write “Jane Doe <jane@example.com>” to say how to greet them."
        placeholder="jane@example.com, Ravi Kumar <ravi@example.com>"
      />

      {parsed.invalid.length > 0 ? (
        <p role="alert" className="text-sm text-destructive">
          Not an email address: {parsed.invalid.join(", ")}
        </p>
      ) : null}

      {parsed.duplicates > 0 ? (
        <p className="text-sm text-muted-foreground">
          {parsed.duplicates} of these {parsed.duplicates === 1 ? "is" : "are"} already covered
          by a client you have chosen, so {parsed.duplicates === 1 ? "it" : "they"} will not be
          written to twice.
        </p>
      ) : null}

      {parsed.recipients.length > 0 ? (
        <ul className="space-y-1 text-sm">
          {parsed.recipients.map((recipient) => (
            <li key={recipient.email} className="flex flex-wrap items-baseline gap-x-2">
              <span className="truncate">{recipient.email}</span>
              <span
                className={
                  // A greeting taken from the address is often wrong — "Dear
                  // Info" — so it is marked rather than presented as settled.
                  recipient.greetingGuessed
                    ? "text-xs text-destructive"
                    : "text-xs text-muted-foreground"
                }
              >
                &lt;name&gt; → {recipient.greeting}
                {recipient.greetingGuessed ? " (guessed from the address)" : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
