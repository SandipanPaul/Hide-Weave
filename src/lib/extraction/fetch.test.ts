import { describe, expect, it } from "vitest";
import { ExtractionError, fetchPage } from "./fetch";
import { extractFromWebsite } from "./index";

/**
 * These never touch the network: every case here is refused by the guards
 * before a request is made, which is exactly the property being tested.
 */

async function failureOf(url: string): Promise<ExtractionError> {
  try {
    await fetchPage(url);
  } catch (error) {
    if (error instanceof ExtractionError) return error;
    throw error;
  }
  throw new Error(`Expected ${url} to be refused`);
}

describe("fetchPage guards", () => {
  it("refuses a URL that is not one", async () => {
    expect((await failureOf("not a url")).kind).toBe("invalid-url");
  });

  it("refuses schemes other than http and https", async () => {
    for (const url of ["ftp://files.example.com/x", "file:///etc/passwd"]) {
      expect((await failureOf(url)).kind, url).toBe("invalid-url");
    }
  });

  it("refuses this machine and the local network", async () => {
    for (const url of [
      "http://localhost:5432/",
      "http://127.0.0.1/",
      "http://[::1]/",
      "http://router/",
      "http://db.internal/",
    ]) {
      const failure = await failureOf(url);
      expect(failure.kind, url).toBe("blocked-address");
      expect(failure.message).toMatch(/private network|this machine/i);
    }
  });

  it("refuses the cloud metadata address", async () => {
    // The classic server-side request forgery target: an app that fetches a
    // user-supplied URL will happily read a VPS's own credentials endpoint.
    expect((await failureOf("http://169.254.169.254/latest/meta-data/")).kind).toBe(
      "blocked-address",
    );
  });

  it("refuses private ranges written in full", async () => {
    for (const url of ["http://10.0.0.5/", "http://192.168.1.1/", "http://172.16.9.9/"]) {
      expect((await failureOf(url)).kind, url).toBe("blocked-address");
    }
  });
});

describe("extractFromWebsite", () => {
  it("reports a bad address without throwing", async () => {
    const result = await extractFromWebsite("not a url");
    expect(result).toEqual({
      ok: false,
      kind: "invalid-url",
      message: "Enter a web address, e.g. example.com or https://example.com",
    });
  });

  it("reports a blocked address in words a user can act on", async () => {
    const result = await extractFromWebsite("http://localhost:3000");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("blocked-address");
      expect(result.message).toMatch(/private network|this machine/i);
    }
  });
});
