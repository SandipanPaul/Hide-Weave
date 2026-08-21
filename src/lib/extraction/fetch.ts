import { lookup } from "node:dns/promises";
import { isPrivateAddress, isPrivateHostname } from "./net";
import { isAllowed } from "./robots";

/**
 * The fetching half of website extraction. Server-side only — the browser
 * never makes these requests, so a site's rules and our own limits cannot be
 * bypassed by the page.
 *
 * Limits, all deliberate: a normal User-Agent, a 10-second timeout, at most 3
 * redirects, 2 MB of response read, HTML only, and no address that is not on
 * the public internet.
 */

export const USER_AGENT = "Mozilla/5.0 (compatible; HideAndWeave/1.0)";

const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;
const MAX_BYTES = 2 * 1024 * 1024;

export type FetchFailureKind =
  | "invalid-url"
  | "blocked-address"
  | "robots"
  | "timeout"
  | "dns"
  | "tls"
  | "http-status"
  | "not-html"
  | "too-many-redirects"
  | "network";

export class ExtractionError extends Error {
  constructor(
    readonly kind: FetchFailureKind,
    message: string,
  ) {
    super(message);
  }
}

/** Resolves the hostname and refuses anything not on the public internet. */
async function assertPublicHost(url: URL): Promise<void> {
  if (isPrivateHostname(url.hostname)) {
    throw new ExtractionError(
      "blocked-address",
      "That address is on this machine or a private network, so it will not be fetched.",
    );
  }

  // A public-looking hostname can still resolve to a private address, which is
  // the usual way this check is dodged.
  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(url.hostname, { all: true });
  } catch {
    throw new ExtractionError(
      "dns",
      `Could not find ${url.hostname}. Check the address for a typo.`,
    );
  }

  if (addresses.length === 0) {
    throw new ExtractionError("dns", `${url.hostname} did not resolve to any address.`);
  }
  if (addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new ExtractionError(
      "blocked-address",
      `${url.hostname} points at a private network address, so it will not be fetched.`,
    );
  }
}

/** Turns a thrown fetch error into one with a message worth showing. */
function toExtractionError(error: unknown, url: URL): ExtractionError {
  if (error instanceof ExtractionError) return error;

  const name = error instanceof Error ? error.name : "";
  if (name === "TimeoutError" || name === "AbortError") {
    return new ExtractionError(
      "timeout",
      `${url.hostname} took longer than 10 seconds to respond.`,
    );
  }

  const cause = (error as { cause?: { code?: string } })?.cause;
  const code = typeof cause?.code === "string" ? cause.code : "";

  if (/CERT|SSL|TLS|ERR_TLS/i.test(code)) {
    return new ExtractionError(
      "tls",
      `${url.hostname} has a security certificate problem (${code}), so it was not fetched.`,
    );
  }
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
    return new ExtractionError("dns", `Could not find ${url.hostname}. Check the address.`);
  }
  if (code === "ECONNREFUSED" || code === "ECONNRESET" || code === "EHOSTUNREACH") {
    return new ExtractionError("network", `${url.hostname} refused the connection.`);
  }

  return new ExtractionError("network", `Could not reach ${url.hostname}.`);
}

export type FetchedPage = {
  /** Where the content actually came from, after any redirects. */
  url: string;
  html: string;
  /** True when the page was longer than the 2 MB we are willing to read. */
  truncated: boolean;
};

/** Reads at most `MAX_BYTES`, then stops — a cap, not a download. */
async function readCapped(response: Response): Promise<{ text: string; truncated: boolean }> {
  const body = response.body;
  if (!body) return { text: "", truncated: false };

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;

  try {
    while (total < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      const remaining = MAX_BYTES - total;
      if (value.byteLength > remaining) {
        chunks.push(value.subarray(0, remaining));
        total = MAX_BYTES;
        truncated = true;
        break;
      }
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }

  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return { text: new TextDecoder("utf-8").decode(buffer), truncated };
}

async function request(url: URL, signal: AbortSignal): Promise<Response> {
  await assertPublicHost(url);
  try {
    return await fetch(url, {
      // Redirects are followed by hand so every hop can be checked: a public
      // host redirecting to 127.0.0.1 is exactly what this guards against.
      redirect: "manual",
      signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en",
      },
    });
  } catch (error) {
    throw toExtractionError(error, url);
  }
}

/**
 * Fetches one page, following redirects by hand so each destination is checked
 * before it is requested.
 */
export async function fetchPage(rawUrl: string): Promise<FetchedPage> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ExtractionError("invalid-url", "That is not a web address.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ExtractionError("invalid-url", "Only http and https addresses can be fetched.");
  }

  const signal = AbortSignal.timeout(TIMEOUT_MS);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await request(url, signal);

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        throw new ExtractionError(
          "http-status",
          `${url.hostname} sent a redirect with nowhere to go (${response.status}).`,
        );
      }
      if (hop === MAX_REDIRECTS) {
        throw new ExtractionError(
          "too-many-redirects",
          `${url.hostname} redirected more than ${MAX_REDIRECTS} times.`,
        );
      }
      try {
        url = new URL(location, url);
      } catch {
        throw new ExtractionError("invalid-url", `${url.hostname} redirected to an invalid address.`);
      }
      continue;
    }

    if (!response.ok) {
      throw new ExtractionError("http-status", describeStatus(response.status, url.hostname));
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      throw new ExtractionError(
        "not-html",
        `${url.hostname} returned ${contentType.split(";")[0] || "an unknown file type"} rather than a web page.`,
      );
    }

    const { text, truncated } = await readCapped(response);
    return { url: url.toString(), html: text, truncated };
  }

  throw new ExtractionError(
    "too-many-redirects",
    `${url.hostname} redirected more than ${MAX_REDIRECTS} times.`,
  );
}

/** Each status the user is likely to meet gets its own explanation. */
function describeStatus(status: number, hostname: string): string {
  if (status === 403) {
    return `${hostname} refused the request (403). Some sites block automated visitors — you can fill the form in by hand.`;
  }
  if (status === 404) return `There is no page at that address on ${hostname} (404).`;
  if (status === 401) return `${hostname} requires a login (401).`;
  if (status === 429) return `${hostname} asked us to slow down (429). Try again in a minute.`;
  if (status >= 500) return `${hostname} had a server error (${status}). Try again later.`;
  return `${hostname} responded with ${status}.`;
}

/**
 * Whether the site's robots.txt permits fetching this path.
 *
 * An unreachable or absent robots.txt means yes, which is what the standard
 * says. A site that says no is not fetched.
 */
export async function robotsAllows(rawUrl: string): Promise<boolean> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }

  const robotsUrl = new URL("/robots.txt", url);
  try {
    await assertPublicHost(robotsUrl);
    const response = await fetch(robotsUrl, {
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "User-Agent": USER_AGENT },
    });
    if (!response.ok) return true;
    const { text } = await readCapped(response);
    return isAllowed(text, url.pathname, USER_AGENT);
  } catch {
    // Could not read it — the standard treats that as permission.
    return true;
  }
}
