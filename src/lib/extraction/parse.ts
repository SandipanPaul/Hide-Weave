import { normalizeWebsite } from "@/lib/url";

/**
 * Pulls exporter details out of a fetched HTML page. Pure — no network, no
 * database — so it can be tested against saved pages rather than live sites.
 *
 * Fields are filled in a fixed priority order, first hit wins per field:
 *
 *   1. JSON-LD Organization / LocalBusiness
 *   2. Open Graph and standard meta tags
 *   3. mailto: and tel: hrefs
 *   4. email and phone patterns in visible text
 *   5. <title>, for the company name only
 *
 * Every value carries where it came from, so the UI can say what it guessed
 * and the caller can judge how much was actually learned.
 */

export type ExtractionSource = "json-ld" | "meta" | "link" | "text" | "title";

export type ExtractedField = { value: string; source: ExtractionSource };

export type ExtractedExporter = {
  companyName?: ExtractedField;
  email?: ExtractedField;
  phone?: ExtractedField;
  address?: ExtractedField;
  /** Used as a starting point for notes, never as a fact about the business. */
  description?: ExtractedField;
};

/** Placeholder titles that name a tool rather than a business. */
const JUNK_TITLES = new Set([
  "contact",
  "contact us",
  "contactus",
  "about",
  "about us",
  "get in touch",
  "wordpress site",
  "just another wordpress site",
  "home",
  "home page",
  "homepage",
  "index",
  "untitled",
  "untitled document",
  "new page",
  "welcome",
  "document",
]);

/** Hosts that only ever appear in tooling, never as a company's own address. */
const JUNK_EMAIL_HOSTS = [
  "sentry.io",
  "wixpress.com",
  "example.com",
  "example.org",
  "domain.com",
  "yourdomain.com",
  "email.com",
  "sentry-cdn.com",
  "godaddy.com",
  "w3.org",
  "schema.org",
];

const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

/**
 * A phone number as written on a website: an optional +, then 7–17 digits
 * separated by spaces, dashes, dots or brackets. Deliberately not clever —
 * anything shorter is a year or a price.
 */
const PHONE_PATTERN = /\+?\d[\d\s().-]{6,20}\d/g;

/** A written date, which matches the phone pattern but is not one. */
const DATE_LIKE = /^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}$/;

// ------------------------------------------------------------------ HTML

function decodeEntities(value: string): string {
  return value
    .replace(/&(?:amp|#38);/gi, "&")
    .replace(/&(?:lt|#60);/gi, "<")
    .replace(/&(?:gt|#62);/gi, ">")
    .replace(/&(?:quot|#34);/gi, '"')
    .replace(/&(?:apos|#39);/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function collapse(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** The page with scripts, styles and markup removed — what a reader sees. */
export function visibleText(html: string): string {
  const withoutCode = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  return collapse(decodeEntities(withoutCode.replace(/<[^>]+>/g, " ")));
}

function titleOf(html: string): string | null {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return match ? collapse(decodeEntities(match[1])) : null;
}

/** First matching meta tag, by property or name, in the order asked for. */
function metaContent(html: string, keys: string[]): string | null {
  for (const key of keys) {
    const pattern = new RegExp(
      `<meta[^>]*(?:property|name)\\s*=\\s*["']${key}["'][^>]*>`,
      "i",
    );
    const tag = pattern.exec(html)?.[0];
    if (!tag) continue;
    const content = /content\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
    if (content && collapse(content) !== "") return collapse(decodeEntities(content));
  }
  return null;
}

/** Every href with the given scheme, in document order. */
function hrefsWithScheme(html: string, scheme: "mailto" | "tel"): string[] {
  const pattern = new RegExp(`href\\s*=\\s*["']${scheme}:([^"']+)["']`, "gi");
  const found: string[] = [];
  for (const match of html.matchAll(pattern)) {
    const value = decodeEntities(match[1]).split("?")[0].trim();
    if (value) found.push(decodeURIComponent(value));
  }
  return found;
}

// --------------------------------------------------------------- JSON-LD

type JsonObject = Record<string, unknown>;

/**
 * Every JSON-LD node on the page, flattened.
 *
 * Blocks may be a single object, an array, or a Yoast-style `@graph`, and a
 * broken block must not lose the good ones — so each is parsed independently
 * and failures are skipped.
 */
export function jsonLdNodes(html: string): JsonObject[] {
  const nodes: JsonObject[] = [];

  const blocks = html.matchAll(
    /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );

  for (const block of blocks) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(decodeEntities(block[1].trim()));
    } catch {
      continue;
    }

    const queue: unknown[] = [parsed];
    while (queue.length > 0) {
      const item = queue.shift();
      if (Array.isArray(item)) {
        queue.push(...item);
      } else if (item && typeof item === "object") {
        const object = item as JsonObject;
        nodes.push(object);
        if (Array.isArray(object["@graph"])) queue.push(...object["@graph"]);
      }
    }
  }

  return nodes;
}

/** Types that describe the business itself, rather than the page about it. */
const BUSINESS_TYPES = [
  "organization",
  "localbusiness",
  "corporation",
  "store",
  "manufacturer",
  "wholesalestore",
  "professionalservice",
];

function typesOf(node: JsonObject): string[] {
  const type = node["@type"];
  return (Array.isArray(type) ? type : [type])
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.toLowerCase());
}

function isBusinessNode(node: JsonObject): boolean {
  // WebPage and WebSite carry a `name` too, but it is the page's title — using
  // it would put "Home | Leather Goods" in the company-name field.
  return typesOf(node).some((value) => BUSINESS_TYPES.includes(value));
}

/**
 * Organization before LocalBusiness.
 *
 * Both describe the business, but sites routinely stuff the LocalBusiness
 * `name` with search terms — barakainternational.in calls itself "Leather
 * Goods Manufacturer in India" there and "Baraka International" in its
 * Organization node. Since the first hit wins per field, the more canonical
 * node has to be consulted first; LocalBusiness still supplies the address and
 * phone that Organization rarely carries.
 */
function businessNodeRank(node: JsonObject): number {
  const types = typesOf(node);
  if (types.includes("organization") || types.includes("corporation")) return 0;
  return 1;
}

function asText(value: unknown): string | null {
  if (typeof value === "string") return collapse(decodeEntities(value)) || null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const text = asText(item);
      if (text) return text;
    }
  }
  return null;
}

/** Flattens a schema.org PostalAddress into the lines people write on labels. */
function flattenAddress(value: unknown): string | null {
  const direct = typeof value === "string" ? asText(value) : null;
  if (direct) return direct;
  if (!value || typeof value !== "object") return null;

  const address = (Array.isArray(value) ? value[0] : value) as JsonObject;
  if (!address || typeof address !== "object") return null;

  const parts = [
    asText(address.streetAddress),
    asText(address.addressLocality),
    [asText(address.addressRegion), asText(address.postalCode)].filter(Boolean).join(" "),
    asText(address.addressCountry),
  ]
    .map((part) => (part ? part.trim() : ""))
    .filter((part) => part !== "");

  return parts.length > 0 ? parts.join(", ") : null;
}

// ------------------------------------------------------------ Validation

export function cleanEmail(raw: string): string | null {
  const value = raw.trim().toLowerCase().replace(/^mailto:/, "");
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(value)) return null;
  const host = value.split("@")[1];
  if (JUNK_EMAIL_HOSTS.some((junk) => host === junk || host.endsWith(`.${junk}`))) return null;
  // "logo@2x.png" and friends match the shape of an address but are filenames.
  if (/\.(png|jpe?g|gif|webp|svg|css|js)$/.test(host)) return null;
  return value;
}

/**
 * Tidies a phone number and rejects what is not one.
 *
 * Real pages contain `tel:++91` and `tel:` links pointing at fragments, so a
 * digit count is the only reliable test: fewer than 7 digits is not a phone
 * number, and more than 15 breaks the E.164 ceiling.
 */
export function cleanPhone(raw: string): string | null {
  // "2022-09-13" has eight digits and separators a phone number is allowed to
  // use. A date is not a phone number.
  if (DATE_LIKE.test(raw.trim())) return null;

  const trimmed = decodeEntities(raw).replace(/[^\d+()\s.-]/g, " ");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;

  const hasPlus = /^\s*\+/.test(trimmed);
  const body = collapse(trimmed.replace(/\+/g, " ")).replace(/\s{2,}/g, " ");
  return hasPlus ? `+${body.replace(/^\s+/, "")}` : body;
}

/**
 * A title reduced to the company name: sites write
 * "Asian Leather | Indian Leather Goods Manufacturer | Exporter", and the
 * first segment is the name.
 */
export function cleanCompanyName(title: string): string | null {
  const first = collapse(title.split(/\s*[|–—·»:]\s*|\s+-\s+/)[0] ?? "");
  if (first.length < 2 || first.length > 80) return null;
  if (JUNK_TITLES.has(first.toLowerCase())) return null;
  return first;
}

// ----------------------------------------------------------- Extraction

function take(
  current: ExtractedField | undefined,
  value: string | null | undefined,
  source: ExtractionSource,
): ExtractedField | undefined {
  // First hit wins: sources are consulted in priority order, so an earlier
  // one is always the better one.
  if (current) return current;
  const text = value?.trim();
  return text ? { value: text, source } : undefined;
}

export function parseExporter(html: string): ExtractedExporter {
  const result: ExtractedExporter = {};

  // 1. JSON-LD describing the business itself.
  const businessNodes = jsonLdNodes(html)
    .filter(isBusinessNode)
    .map((node, index) => ({ node, index }))
    .sort((a, b) => businessNodeRank(a.node) - businessNodeRank(b.node) || a.index - b.index)
    .map((entry) => entry.node);

  for (const node of businessNodes) {
    result.companyName = take(result.companyName, asText(node.name), "json-ld");
    result.email = take(result.email, cleanEmailish(asText(node.email)), "json-ld");
    result.phone = take(
      result.phone,
      cleanPhone(asText(node.telephone) ?? asText(node.phone) ?? ""),
      "json-ld",
    );
    result.address = take(result.address, flattenAddress(node.address), "json-ld");
    result.description = take(result.description, asText(node.description), "json-ld");
  }

  // 2. Open Graph and standard meta tags.
  // The same trimming as a title: exelfashions.com sets og:site_name to
  // "XL Enterprises Limited - Leather Goods Manufacturer, Exporter, …".
  const siteName = metaContent(html, ["og:site_name", "application-name"]);
  result.companyName = take(
    result.companyName,
    siteName ? cleanCompanyName(siteName) : null,
    "meta",
  );
  result.description = take(
    result.description,
    metaContent(html, ["og:description", "description"]),
    "meta",
  );

  // 3. mailto: and tel: hrefs anywhere in the document.
  for (const href of hrefsWithScheme(html, "mailto")) {
    result.email = take(result.email, cleanEmail(href), "link");
    if (result.email) break;
  }
  for (const href of hrefsWithScheme(html, "tel")) {
    result.phone = take(result.phone, cleanPhone(href), "link");
    if (result.phone) break;
  }

  // 4. Patterns in the visible text.
  const text = visibleText(html);
  if (!result.email) {
    for (const candidate of text.match(EMAIL_PATTERN) ?? []) {
      result.email = take(result.email, cleanEmail(candidate), "text");
      if (result.email) break;
    }
  }
  if (!result.phone) {
    for (const candidate of text.match(PHONE_PATTERN) ?? []) {
      result.phone = take(result.phone, cleanPhone(candidate), "text");
      if (result.phone) break;
    }
  }

  // 5. The title, as a last resort for the name only.
  const title = titleOf(html);
  if (title) result.companyName = take(result.companyName, cleanCompanyName(title), "title");

  return result;
}

/** JSON-LD `email` values are sometimes written as "mailto:x@y.com". */
function cleanEmailish(value: string | null): string | null {
  return value ? cleanEmail(value) : null;
}

// -------------------------------------------------- Contact-page discovery

/** Link text or path that suggests a page carrying the real contact details. */
const CONTACT_HINTS = [
  "contact",
  "contact-us",
  "contactus",
  "get-in-touch",
  "reach-us",
  "about",
  "about-us",
  "aboutus",
  "imprint",
  "impressum",
  "legal-notice",
];

/**
 * The single best contact-ish link on the page, resolved against the page's
 * own URL.
 *
 * One page is fetched after the homepage, never more — this looks for contact
 * details, it does not crawl a site.
 */
export function findContactLink(html: string, baseUrl: string): string | null {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return null;
  }

  const anchors = html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi);
  const candidates: Array<{ url: string; rank: number }> = [];

  for (const anchor of anchors) {
    const rawHref = decodeEntities(anchor[1]).trim();
    if (!rawHref || rawHref.startsWith("#") || /^(mailto|tel|javascript):/i.test(rawHref)) continue;

    let resolved: URL;
    try {
      resolved = new URL(rawHref, base);
    } catch {
      continue;
    }
    // Same site only: a "contact us" link to a marketplace profile is not this
    // exporter's contact page.
    if (resolved.hostname.replace(/^www\./, "") !== base.hostname.replace(/^www\./, "")) continue;
    if (!/^https?:$/.test(resolved.protocol)) continue;

    const label = visibleText(anchor[2]).toLowerCase();
    const path = resolved.pathname.toLowerCase();
    const rank = CONTACT_HINTS.findIndex(
      (hint) => label.includes(hint.replace(/-/g, " ")) || label.includes(hint) || path.includes(hint),
    );
    if (rank === -1) continue;

    resolved.hash = "";
    if (normalizeWebsite(resolved.toString()) === normalizeWebsite(baseUrl)) continue;
    candidates.push({ url: resolved.toString(), rank });
  }

  if (candidates.length === 0) return null;
  // "contact" beats "about" beats "impressum", by the order of the hint list.
  candidates.sort((a, b) => a.rank - b.rank);
  return candidates[0].url;
}

/** Later findings fill only the gaps the first page left. */
export function mergeExtracted(
  first: ExtractedExporter,
  second: ExtractedExporter,
): ExtractedExporter {
  const merged: ExtractedExporter = { ...first };
  for (const key of Object.keys(second) as Array<keyof ExtractedExporter>) {
    if (!merged[key]) merged[key] = second[key];
  }
  return merged;
}
