import { ExtractionError, fetchPage, robotsAllows } from "./fetch";
import {
  findContactLink,
  mergeExtracted,
  parseExporter,
  type ExtractedExporter,
} from "./parse";
import { isPrivateAddress } from "./net";
import { normalizeWebsite } from "@/lib/url";

/**
 * Website extraction, end to end.
 *
 * Fetch the page, read what it says about the business, and — only if no email
 * was found — fetch one contact-ish page as well. One extra request, never a
 * crawl.
 *
 * Nothing here writes to the database. The result is a suggestion that lands
 * in the add form for the user to check.
 */

export type ExtractionOutcome =
  | {
      ok: true;
      /** Where extraction started, canonical form. */
      url: string;
      /** The page the details actually came from, after redirects. */
      finalUrl: string;
      /** The second page consulted, when the homepage had no email. */
      alsoRead: string | null;
      fields: ExtractedExporter;
    }
  | { ok: false; kind: string; message: string };

/**
 * Whether a rejected address was rejected for being local rather than junk.
 *
 * Narrower than `isPrivateHostname`, deliberately: that treats any dotless
 * name as a machine on the network, which is right when resolving but wrong
 * here — someone typing "nonsense" wants "that is not a web address", not a
 * lecture about private networks.
 */
function looksPrivate(rawUrl: string): boolean {
  const trimmed = rawUrl.trim();
  if (trimmed === "") return false;
  try {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
    const host = new URL(withScheme).hostname.toLowerCase().replace(/\.$/, "");
    if (host === "localhost" || host.endsWith(".localhost")) return true;
    if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".home.arpa")) {
      return true;
    }
    // An IP address, private or otherwise, is not a website to be read.
    return isPrivateAddress(host);
  } catch {
    return false;
  }
}

export async function extractFromWebsite(rawUrl: string): Promise<ExtractionOutcome> {
  const url = normalizeWebsite(rawUrl);
  if (!url) {
    // "localhost:3000" and "http://10.0.0.5" are rejected as websites before
    // the address guard ever sees them. Saying "enter a web address" would be
    // misleading — they are addresses, just not ones this will fetch.
    if (looksPrivate(rawUrl)) {
      return {
        ok: false,
        kind: "blocked-address",
        message:
          "That address is on this machine or a private network, so it will not be fetched.",
      };
    }
    return {
      ok: false,
      kind: "invalid-url",
      message: "Enter a web address, e.g. example.com or https://example.com",
    };
  }

  try {
    if (!(await robotsAllows(url))) {
      return {
        ok: false,
        kind: "robots",
        message:
          "This site's robots.txt asks automated visitors not to read it, so it was not fetched. You can fill the form in by hand.",
      };
    }

    const home = await fetchPage(url);
    let fields = parseExporter(home.html);
    let alsoRead: string | null = null;

    // One extra fetch, and only to find an email the homepage did not carry.
    if (!fields.email) {
      const contactUrl = findContactLink(home.html, home.url);
      if (contactUrl) {
        try {
          const contact = await fetchPage(contactUrl);
          fields = mergeExtracted(fields, parseExporter(contact.html));
          alsoRead = contact.url;
        } catch {
          // The contact page is a bonus; failing to read it is not a failure
          // of the extraction as a whole.
        }
      }
    }

    return {
      ok: true,
      url,
      finalUrl: home.url,
      alsoRead,
      fields,
    };
  } catch (error) {
    if (error instanceof ExtractionError) {
      return { ok: false, kind: error.kind, message: error.message };
    }
    return {
      ok: false,
      kind: "network",
      message: "Something went wrong reading that site. You can fill the form in by hand.",
    };
  }
}

export { ExtractionError } from "./fetch";
export type { ExtractedExporter, ExtractionSource } from "./parse";
