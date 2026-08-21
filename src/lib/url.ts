/**
 * Website URLs, normalised.
 *
 * People type "asianleather.com", paste "https://www.asianleather.com/", and
 * copy "HTTP://AsianLeather.com" out of an email. Those are one site, and the
 * app treats them as one: stored in a canonical form, compared by a key that
 * ignores the parts that never distinguish two businesses.
 */

/** Schemes we will ever store or fetch. Anything else is not a website. */
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * A hostname that could plausibly be a real site: at least one dot, and a
 * letter-only TLD. Keeps "localhost", "192.168.0.1" and typos like "acme"
 * from being accepted as websites.
 */
const HOSTNAME = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/i;

/**
 * Canonical form for storage: scheme and host lower-cased, default ports and
 * a bare trailing slash dropped, a missing scheme assumed to be https.
 *
 * Returns null for anything that is not a usable web address, so callers can
 * decide whether that is an error or simply no website.
 */
export function normalizeWebsite(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (trimmed === "") return null;

  // "example.com/path" has no scheme; "mailto:x@y.com" has the wrong one.
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol.toLowerCase())) return null;
  if (!HOSTNAME.test(url.hostname)) return null;

  url.protocol = url.protocol.toLowerCase();
  url.hostname = url.hostname.toLowerCase();
  // URL already drops the port when it matches the scheme's default.
  url.hash = "";

  const text = url.toString();
  // "https://example.com/" and "https://example.com" are the same address; the
  // shorter form is what people recognise.
  return url.pathname === "/" && !url.search ? text.replace(/\/$/, "") : text;
}

/**
 * Comparison key for uniqueness: no scheme, no "www.", no trailing slash.
 *
 * So http://www.asianleather.com/ and https://asianleather.com are one
 * exporter, which is what matters when the same site arrives twice from two
 * different sources.
 */
export function websiteKey(input: string | null | undefined): string {
  const normalized = normalizeWebsite(input);
  if (!normalized) return "";

  const url = new URL(normalized);
  const host = url.hostname.replace(/^www\./, "");
  const path = url.pathname.replace(/\/+$/, "");
  return `${host}${path}${url.search}`.toLowerCase();
}

/** The bare domain, for display: "https://www.asianleather.com/" -> "asianleather.com". */
export function displayHost(input: string | null | undefined): string {
  const normalized = normalizeWebsite(input);
  if (!normalized) return "";
  return new URL(normalized).hostname.replace(/^www\./, "");
}
