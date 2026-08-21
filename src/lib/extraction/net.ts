/**
 * Address filtering for server-side fetches.
 *
 * The app fetches a URL the user typed. Without this, "http://127.0.0.1:5432"
 * or a cloud metadata address would be fetched by the server, from inside the
 * network, and its response shown back to the browser. Every hostname is
 * resolved and every address checked before a request is made — and again
 * after each redirect, since a public host can redirect to a private one.
 */

/** Parses "10.0.0.1" into its four octets, or null if it is not IPv4. */
function ipv4Octets(address: string): number[] | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : NaN));
  return octets.every((value) => Number.isInteger(value) && value >= 0 && value <= 255)
    ? octets
    : null;
}

/**
 * True for anything that is not a public internet address: loopback, private
 * ranges, link-local (including cloud metadata at 169.254.169.254), carrier
 * NAT, benchmarking, multicast and reserved space.
 */
export function isPrivateAddress(address: string): boolean {
  const value = address.trim().toLowerCase().replace(/^\[|\]$/g, "");

  // IPv4-mapped IPv6 ("::ffff:127.0.0.1") is an IPv4 address wearing a hat.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(value);
  if (mapped) return isPrivateAddress(mapped[1]);

  const octets = ipv4Octets(value);
  if (octets) {
    const [a, b] = octets;
    if (a === 0) return true; // 0.0.0.0/8, "this network"
    if (a === 10) return true; // private
    if (a === 127) return true; // loopback
    if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
    if (a === 169 && b === 254) return true; // link-local, incl. metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 192 && b === 0) return true; // protocol assignments / TEST-NET-1
    if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
    if (a === 198 && b === 51) return true; // TEST-NET-2
    if (a === 203 && b === 0) return true; // TEST-NET-3
    if (a >= 224) return true; // multicast and reserved
    return false;
  }

  if (value === "::" || value === "::1") return true; // unspecified, loopback
  if (/^f[cd][0-9a-f]{2}:/.test(value)) return true; // unique local, fc00::/7
  if (/^fe[89ab][0-9a-f]:/.test(value)) return true; // link-local, fe80::/10
  if (/^ff[0-9a-f]{2}:/.test(value)) return true; // multicast

  // Any other IPv6 address is public, and anything that is not an IP at all is
  // a hostname — which is decided by resolving it, not by looking at it.
  return false;
}

/** Hostnames that never belong to a public site, before DNS is even consulted. */
export function isPrivateHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".home.arpa")) {
    return true;
  }
  // A bare name with no dot is a machine on the local network, not a website.
  if (!host.includes(".")) return true;
  return isPrivateAddress(host);
}
