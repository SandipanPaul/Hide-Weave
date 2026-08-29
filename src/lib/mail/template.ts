/**
 * Turning one typed message into one client's copy of it.
 *
 * Deliberately free of Prisma and of `next/headers`: the compose screen
 * previews with these exact functions in the browser, and the sender calls
 * them on the server. One implementation means the preview cannot promise
 * something the send does not deliver.
 */

/** What the user types in the body to mark where a name goes. */
export const NAME_PLACEHOLDER = "<name>";

/** Matched case-insensitively — `<Name>` at the start of a line is the same. */
const NAME_PATTERN = /<name>/gi;

/**
 * Honorifics that precede a first name in a contact list. Stripped so
 * "Mr. Daniel Okoro" greets Daniel rather than Mr.
 */
const HONORIFIC = /^(mr|mrs|ms|miss|mx|dr|prof|sir|madam|shri|smt)\.?\s+/i;

/**
 * The word `<name>` becomes for one client.
 *
 * The contact person's first name when there is one, and the company name
 * otherwise — 37 of the client records here have an address but no named
 * person, and a mail that cannot be personalised is still worth sending.
 * A company name is never truncated to its first word: "Meridian Foods Ltd"
 * is the name, "Meridian" is not.
 */
export function greetingFor(client: {
  contactPerson?: string | null;
  name: string;
}): string {
  const person = client.contactPerson?.replace(HONORIFIC, "").trim() ?? "";
  if (person !== "") {
    const [firstName] = person.split(/\s+/);
    if (firstName) return firstName;
  }
  return client.name.trim();
}

/** Substitutes every `<name>` in the body. Other angle-bracket text is left alone. */
export function renderBody(template: string, greeting: string): string {
  return template.replace(NAME_PATTERN, greeting);
}

/**
 * True when the body will be personalised at all.
 *
 * Uses its own non-global copy of the pattern on purpose: `.test()` on a `/g`
 * regex advances `lastIndex`, so sharing NAME_PATTERN would make every second
 * call answer differently for the same string.
 */
export function hasPlaceholder(template: string): boolean {
  return /<name>/i.test(template);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The HTML alternative of a plain-text body.
 *
 * The message is typed as text, so this only preserves the shape of it —
 * line breaks become breaks, and everything else is escaped. No markup the
 * user did not type is introduced, which is what keeps a mail written by a
 * person looking like one rather than like a newsletter.
 */
export function toHtml(text: string): string {
  return escapeHtml(text).replace(/\r\n|\r|\n/g, "<br>\n");
}
