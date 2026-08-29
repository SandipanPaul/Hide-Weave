import { z } from "zod";
import { emailKey } from "@/lib/contacts";
import { greetingFor } from "@/lib/mail/template";

/**
 * Email addresses typed straight into the compose screen, for people who are
 * not clients — a prospect, a colleague, a copy to oneself.
 *
 * Pure, and free of Prisma and `next/headers`: the compose screen parses as the
 * user types so they can see exactly who they have added, and the server action
 * parses the same string again before creating anything. One implementation
 * means the list on screen cannot differ from the list that gets written to.
 */

/**
 * Splits on commas, semicolons and newlines — but not inside quotes or angle
 * brackets, because `"Doe, Jane" <jane@x.com>` is one recipient and a plain
 * split would make it two, one of which is not an address.
 *
 * Not split on "/": it appears inside real display names.
 */
function splitEntries(raw: string): string[] {
  const entries: string[] = [];
  let current = "";
  let quoted = false;
  let bracketed = false;

  for (const character of raw) {
    if (character === '"') quoted = !quoted;
    else if (character === "<") bracketed = true;
    else if (character === ">") bracketed = false;

    if (!quoted && !bracketed && /[,;\r\n]/.test(character)) {
      entries.push(current);
      current = "";
      continue;
    }
    current += character;
  }

  entries.push(current);
  return entries;
}

/** "Jane Doe <jane@example.com>" — the form every mail client writes. */
const NAMED = /^(.*?)\s*<\s*([^<>\s]+)\s*>$/;

export type ExtraRecipient = {
  email: string;
  /** What `<name>` becomes for them. */
  greeting: string;
  /** The display name if one was given, otherwise the address. */
  label: string;
  /** True when the greeting was guessed from the address, not given. */
  greetingGuessed: boolean;
};

export type ParsedExtras = {
  recipients: ExtraRecipient[];
  /** Entries that are not usable addresses, kept as typed so they can be fixed. */
  invalid: string[];
};

/**
 * A greeting for a bare address, from its local part.
 *
 * "jane.doe@x.com" gives "Jane", which is usually right. "info@x.com" gives
 * "Info", which is not — so every one of these is marked as guessed and shown
 * back before anything is sent. Typing "Jane Doe <jane@x.com>" avoids the
 * guess entirely.
 */
function greetingFromAddress(email: string): string {
  const local = email.split("@")[0] ?? "";
  const first = local.split(/[._\-+]/).filter(Boolean)[0] ?? local;
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : email;
}

function parseOne(entry: string): ExtraRecipient | null {
  const trimmed = entry.trim();
  if (trimmed === "") return null;

  const named = NAMED.exec(trimmed);
  // Strip the quotes mail clients put around a display name containing a comma.
  const displayName = named?.[1]?.trim().replace(/^"(.*)"$/, "$1").trim() ?? "";
  const email = (named?.[2] ?? trimmed).trim();

  if (!z.email().safeParse(email).success) return null;

  return {
    email,
    // The same rule clients get: a first name, honorific stripped. Passed as
    // `contactPerson` because that is the branch of greetingFor that takes a
    // person's name — `name` is the company-name fallback, kept whole.
    greeting: displayName
      ? greetingFor({ contactPerson: displayName, name: displayName })
      : greetingFromAddress(email),
    label: displayName || email,
    greetingGuessed: displayName === "",
  };
}

/**
 * Splits what was typed into usable recipients and unusable leftovers.
 *
 * Nothing is silently dropped: an entry that is not an address comes back in
 * `invalid` so the screen can show it, because quietly ignoring a mistyped
 * address means someone simply never hears from you.
 *
 * De-duplicated by address, keeping the first spelling — so a name given once
 * is not lost to a bare repeat of the same address later in the list.
 */
export function parseExtraRecipients(raw: string | null | undefined): ParsedExtras {
  if (!raw) return { recipients: [], invalid: [] };

  const recipients: ExtraRecipient[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();

  for (const entry of splitEntries(raw)) {
    if (entry.trim() === "") continue;

    const parsed = parseOne(entry);
    if (!parsed) {
      invalid.push(entry.trim());
      continue;
    }

    const key = emailKey(parsed.email);
    if (seen.has(key)) continue;
    seen.add(key);
    recipients.push(parsed);
  }

  return { recipients, invalid };
}

/**
 * Drops typed addresses that a chosen client already covers.
 *
 * Without this, adding your own contact at a client you had also ticked would
 * send them the same message twice — and the second copy is the one that looks
 * careless.
 */
export function withoutClientAddresses(
  extras: ExtraRecipient[],
  clientEmails: string[],
): ExtraRecipient[] {
  const taken = new Set(clientEmails.map(emailKey));
  return extras.filter((extra) => !taken.has(emailKey(extra.email)));
}
