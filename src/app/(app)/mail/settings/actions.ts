"use server";

import { revalidatePath } from "next/cache";
import { clearMailSettings, mailConfig, mailSettingsView, saveMailSettings } from "@/lib/mail/settings";
import { mailTransport, verifyMailConfig } from "@/lib/mail/transport";
import { failure, invalid, mailSettingsSchema, type ActionResult } from "@/lib/schemas";

/**
 * Reading and writing the mail credentials from inside the app.
 *
 * These exist so a deployed server can be configured without a shell. The
 * password is written encrypted (src/lib/mail/secrets.ts) and is never read
 * back out to a page — the form only ever learns whether one is stored.
 */

function revalidateMail() {
  // Every mail page branches on whether mail is configured, so all of them are
  // stale the moment this changes.
  revalidatePath("/mail", "layout");
}

/**
 * Turns a mail-server error into something worth showing a person.
 *
 * Every branch ends with the server's own words. That is deliberate: mail
 * servers say precisely why they refused, and an earlier version of this
 * function replaced the response with a guess, which left no way to tell a
 * wrong password from a blocked account.
 */
function explain(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const said = message.replace(/\s+/g, " ").trim();

  if (/invalid login|authenticate|username and password not accepted|BadCredentials|535/i.test(message)) {
    return `The mail server rejected these details. This needs an app password rather than your account password — check that, and the address. The server said: ${said}`;
  }

  if (/ENOTFOUND|EDNS/i.test(message)) {
    return `No mail server was found at that address. The server said: ${said}`;
  }

  if (/ECONNECTION|ETIMEDOUT|ESOCKET|ECONNREFUSED/i.test(message)) {
    return `Could not reach the mail server. The server said: ${said}`;
  }

  return said;
}

export async function updateMailSettings(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = mailSettingsSchema.safeParse({
    provider: formData.get("provider"),
    user: formData.get("user"),
    fromName: formData.get("fromName"),
    password: formData.get("password"),
  });
  if (!parsed.success) return invalid(parsed.error);

  const { user, fromName, password, provider } = parsed.data;

  // A blank password field means "keep the stored one", so it is only an error
  // when there is nothing stored to keep.
  const current = await mailSettingsView();
  if (password === undefined && !(current.hasPassword && current.source === "settings")) {
    return failure("Enter the app password.", "password");
  }

  try {
    await saveMailSettings({ user, fromName: fromName ?? "", password, provider });
  } catch (error) {
    // The realistic failure is an unusable SESSION_SECRET, which the user can
    // do something about — so it is worth repeating rather than swallowing.
    return failure(explain(error));
  }

  revalidateMail();
  return { ok: true, data: undefined };
}

/**
 * Proves the saved credentials work by sending one message to the address
 * they belong to.
 *
 * Sent to the configured address itself, never anywhere else: this button is
 * for checking a password, and it should be impossible to press it and have a
 * client receive something.
 */
export async function sendTestEmail(): Promise<ActionResult> {
  const config = await mailConfig();
  if (!config) return failure("Save the address and app password first.");

  try {
    await verifyMailConfig(config);
    await mailTransport(config).sendMail({
      from: `"${config.fromName}" <${config.user}>`,
      to: config.user,
      subject: "Hide & Weave — mail is working",
      text:
        "This is the test message from the Mail settings page.\n\n" +
        "If you are reading it, bulk mailings will send from this address.",
    });
  } catch (error) {
    return failure(explain(error));
  }

  return { ok: true, data: undefined };
}

/** Forgets the saved credentials, falling back to the environment if it is set. */
export async function forgetMailSettings(): Promise<ActionResult> {
  try {
    await clearMailSettings();
  } catch {
    return failure("Could not clear these settings. Please try again.");
  }
  revalidateMail();
  return { ok: true, data: undefined };
}
