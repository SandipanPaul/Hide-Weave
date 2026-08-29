"use client";

import { useActionState, useState } from "react";
import { Eraser, Save, SendHorizonal } from "lucide-react";
import { forgetMailSettings, sendTestEmail, updateMailSettings } from "./actions";
import { SelectField, TextField } from "@/components/form/fields";
import { FormErrors } from "@/components/form/form-errors";
import { SubmitButton } from "@/components/form/submit-button";
import { useAction } from "@/components/form/use-action";
import { Button } from "@/components/ui/button";
import { LINK_CLASS } from "@/components/ui/link-styles";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { MAIL_PROVIDERS, PROVIDER_PRESETS, type MailProvider } from "@/lib/mail/providers";
import type { MailSettingsView } from "@/lib/mail/settings";
import type { ActionResult } from "@/lib/schemas";

/**
 * The mail credentials, editable from inside the app.
 *
 * The password is write-only: it is stored encrypted and never sent back to
 * this page, so the field starts blank even when one is saved, and a blank
 * field on save means "keep the one you have". The only way to find out
 * whether the stored password is right is to use it, which is what the test
 * button does.
 */
const PROVIDER_OPTIONS = MAIL_PROVIDERS.map((id) => ({
  value: id,
  label: PROVIDER_PRESETS[id].label,
}));

export function MailSettingsForm({ settings }: { settings: MailSettingsView }) {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    updateMailSettings,
    null,
  );
  const { run, pending } = useAction();

  const [provider, setProvider] = useState<MailProvider>(settings.provider);
  const [user, setUser] = useState(settings.user);
  const [fromName, setFromName] = useState(settings.fromName);
  const [password, setPassword] = useState("");

  const errors = state?.ok === false ? state : null;
  const savedHere = settings.source === "settings";
  const preset = PROVIDER_PRESETS[provider];

  return (
    <div className="max-w-xl space-y-6">
      {settings.passwordUnreadable ? (
        <FormErrors
          errors={[
            "The saved password can no longer be read, which happens when SESSION_SECRET changes. Enter the app password again — the old one cannot be recovered.",
          ]}
        />
      ) : null}

      <form action={formAction} className="space-y-4">
        {errors ? <FormErrors errors={errors.formErrors} /> : null}

        <SelectField
          label="Mail account"
          name="provider"
          value={provider}
          onValueChange={(value) => setProvider(value as MailProvider)}
          options={PROVIDER_OPTIONS}
          hint={`Connects to ${preset.host} on port ${preset.port}.`}
        />

        <TextField
          label="Send from"
          name="user"
          type="email"
          value={user}
          onValueChange={setUser}
          required
          error={errors?.fieldErrors.user?.[0]}
          hint={`The ${preset.label} address mailings go out from. Replies come back here. It allows ${preset.dailyLimit}.`}
          placeholder="you@example.com"
        />

        <TextField
          label="App password"
          name="password"
          type="password"
          value={password}
          onValueChange={setPassword}
          error={errors?.fieldErrors.password?.[0]}
          autoComplete="new-password"
          placeholder={
            savedHere ? "•••• •••• •••• ••••  (leave blank to keep)" : "abcd efgh ijkl mnop"
          }
          hint={
            savedHere
              ? "A password is saved. Leave this blank unless you are replacing it."
              : preset.passwordHint
          }
          annotation={
            <a
              href={preset.appPasswordUrl}
              target="_blank"
              rel="noreferrer"
              className={LINK_CLASS}
            >
              Get one
            </a>
          }
        />

        <TextField
          label="Your name"
          name="fromName"
          value={fromName}
          onValueChange={setFromName}
          error={errors?.fieldErrors.fromName?.[0]}
          hint="Shown as the sender's name. The address above is always the sender."
          placeholder="Hide & Weave"
        />

        <div className="flex items-center gap-3">
          <SubmitButton pendingLabel="Saving…">
            <Save className="size-4" aria-hidden />
            Save
          </SubmitButton>
          {state?.ok ? <span className="text-sm text-muted-foreground">Saved.</span> : null}
        </div>
      </form>

      <div className="space-y-3 border-t pt-4">
        <div>
          <p className="text-sm font-medium">Check it works</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Sends one message to {user || "the address above"} and nowhere else. Worth
            doing before a mailing — a wrong password otherwise shows up halfway
            through one.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={pending || !settings.hasPassword}
            onClick={() => run(() => sendTestEmail(), "Test sent. Check that inbox.")}
          >
            <SendHorizonal className="size-4" aria-hidden />
            Send a test to myself
          </Button>

          {savedHere ? (
            <AlertDialog>
              <AlertDialogTrigger
                render={<Button type="button" variant="ghost" disabled={pending} />}
              >
                <Eraser className="size-4" aria-hidden />
                Forget these details
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Forget the mail settings?</AlertDialogTitle>
                  <AlertDialogDescription>
                    The address and password are deleted and mailings stop working
                    until they are entered again. Mailings already sent are
                    untouched.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep them</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => run(() => forgetMailSettings(), "Mail settings cleared.")}
                  >
                    Forget them
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
        </div>
      </div>
    </div>
  );
}
