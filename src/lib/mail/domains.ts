import "server-only";
import { Resolver } from "node:dns/promises";

/**
 * Does this domain exist at all?
 *
 * Sending to a domain that does not exist produces a bounce in the sender's
 * inbox minutes later, where this app cannot see it — so the record says SENT
 * and reality says otherwise. A DNS lookup costs milliseconds and catches the
 * worst of it before a message ever leaves.
 *
 * Deliberately conservative. Only NXDOMAIN — the name does not exist — is
 * treated as proof. A resolver that times out, or answers "no MX records",
 * proves nothing: a domain with no MX can still receive mail on its A record,
 * and a resolver having a bad day would otherwise cause this app to refuse a
 * whole mailing. Anything uncertain is allowed through and left to SMTP.
 */

export type DomainVerdict = "exists" | "missing" | "unknown";

/**
 * A resolver with a short timeout and one retry.
 *
 * The default resolver waits far longer, and a slow lookup would stall a
 * campaign one recipient at a time.
 */
function resolver(): Resolver {
  const instance = new Resolver({ timeout: 3000, tries: 2 });
  return instance;
}

/** NXDOMAIN from either lookup, and nothing contradicting it, means missing. */
export async function checkDomain(domain: string): Promise<DomainVerdict> {
  const name = domain.trim().toLowerCase();
  if (!name || !name.includes(".")) return "missing";

  const dns = resolver();

  // MX first: a domain that accepts mail almost always publishes one.
  try {
    const mx = await dns.resolveMx(name);
    if (mx.length > 0) return "exists";
  } catch (error) {
    if ((error as { code?: string }).code !== "ENOTFOUND") return "unknown";
  }

  // No MX, or NXDOMAIN on MX. An A record still means mail can be delivered,
  // and its absence alongside NXDOMAIN is the proof we are looking for.
  try {
    const a = await dns.resolve4(name);
    return a.length > 0 ? "exists" : "unknown";
  } catch (error) {
    return (error as { code?: string }).code === "ENOTFOUND" ? "missing" : "unknown";
  }
}

/**
 * Checks many addresses, one lookup per distinct domain.
 *
 * Returns only the addresses whose domain is certainly gone, each with a
 * reason fit to show a person.
 */
export async function findDeadDomains(
  emails: readonly string[],
): Promise<Map<string, string>> {
  const domains = new Map<string, string[]>();
  for (const email of emails) {
    const domain = email.split("@")[1]?.trim().toLowerCase();
    if (!domain) continue;
    domains.set(domain, [...(domains.get(domain) ?? []), email]);
  }

  const dead = new Map<string, string>();
  await Promise.all(
    [...domains.entries()].map(async ([domain, addresses]) => {
      if ((await checkDomain(domain)) !== "missing") return;
      for (const address of addresses) {
        dead.set(address, `The domain ${domain} does not exist, so this could never be delivered.`);
      }
    }),
  );

  return dead;
}
