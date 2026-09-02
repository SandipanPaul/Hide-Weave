import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Refusing to send to a domain that does not exist.
 *
 * The rule that matters is the conservative one: only a definitive NXDOMAIN
 * counts. A resolver that times out, or a domain with no MX but a working A
 * record, must not cause a real client to be skipped — a mailing silently
 * missing people is worse than the bounce this is trying to prevent.
 */

type Verdict = "mx" | "a" | "nxdomain" | "timeout";

/** Stands in for DNS: what each domain answers for MX and A. */
function stubResolver(answers: Record<string, Verdict>) {
  const fail = (code: string) => Object.assign(new Error(code), { code });

  vi.doMock("node:dns/promises", () => ({
    Resolver: class {
      async resolveMx(name: string) {
        const verdict = answers[name];
        if (verdict === "mx") return [{ exchange: "mail." + name, priority: 10 }];
        if (verdict === "nxdomain") throw fail("ENOTFOUND");
        if (verdict === "timeout") throw fail("ETIMEOUT");
        return [];
      }
      async resolve4(name: string) {
        const verdict = answers[name];
        if (verdict === "a" || verdict === "mx") return ["203.0.113.1"];
        if (verdict === "nxdomain") throw fail("ENOTFOUND");
        throw fail("ETIMEOUT");
      }
    },
  }));
}

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("node:dns/promises");
});

async function load() {
  return import("@/lib/mail/domains");
}

describe("checkDomain", () => {
  it("accepts a domain that publishes MX records", async () => {
    stubResolver({ "oakhide.com": "mx" });
    expect(await (await load()).checkDomain("oakhide.com")).toBe("exists");
  });

  it("accepts a domain with no MX but a working A record", async () => {
    // Mail falls back to the A record, so no MX is not proof of anything.
    stubResolver({ "oakhide.com": "a" });
    expect(await (await load()).checkDomain("oakhide.com")).toBe("exists");
  });

  it("reports a domain that does not exist", async () => {
    stubResolver({ "belsac.uk": "nxdomain" });
    expect(await (await load()).checkDomain("belsac.uk")).toBe("missing");
  });

  it("says it does not know when the resolver fails", async () => {
    // A resolver having a bad day must never make this app skip a real client.
    stubResolver({ "oakhide.com": "timeout" });
    expect(await (await load()).checkDomain("oakhide.com")).toBe("unknown");
  });

  it("rejects something that is not a domain at all", async () => {
    stubResolver({});
    const { checkDomain } = await load();
    expect(await checkDomain("")).toBe("missing");
    expect(await checkDomain("localhost")).toBe("missing");
  });
});

describe("findDeadDomains", () => {
  it("returns only the addresses that can never be delivered", async () => {
    // The real case: two dead domains from one mailing, alongside live ones.
    stubResolver({
      "belsac.uk": "nxdomain",
      "credo-soligen.de": "nxdomain",
      "credo-solingen.de": "mx",
      "casselini.co.jp": "mx",
    });

    const dead = await (await load()).findDeadDomains([
      "camilla@belsac.uk",
      "c.tugsavrol@credo-soligen.de",
      "n.kracht@credo-solingen.de",
      "akira@casselini.co.jp",
    ]);

    expect([...dead.keys()].sort()).toEqual([
      "c.tugsavrol@credo-soligen.de",
      "camilla@belsac.uk",
    ]);
    expect(dead.get("camilla@belsac.uk")).toContain("belsac.uk does not exist");
  });

  it("catches every address on the same dead domain", async () => {
    stubResolver({ "gone.example": "nxdomain" });
    const dead = await (await load()).findDeadDomains(["a@gone.example", "b@gone.example"]);
    expect(dead.size).toBe(2);
  });

  it("is empty when every domain is fine", async () => {
    stubResolver({ "oakhide.com": "mx" });
    expect((await (await load()).findDeadDomains(["a@oakhide.com"])).size).toBe(0);
  });
});
