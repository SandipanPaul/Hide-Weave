import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createSessionToken,
  isPasswordCorrect,
  isSessionValid,
  SESSION_COOKIE_OPTIONS,
} from "@/lib/auth";

/**
 * The password gate — the only thing between the open internet and every
 * client record in the app.
 *
 * It had no tests at all. A change that broke expiry checking, or that stopped
 * verifying the signature, would let anyone in and nothing else in the suite
 * would notice: every other test supplies its own session or bypasses the gate
 * entirely.
 */

const SECRET = "a-long-enough-session-secret-value";

beforeEach(() => {
  process.env.SESSION_SECRET = SECRET;
  process.env.APP_PASSWORD = "correct horse battery staple";
});

afterEach(() => {
  process.env.SESSION_SECRET = SECRET;
});

describe("isPasswordCorrect", () => {
  it("accepts the password and nothing else", () => {
    expect(isPasswordCorrect("correct horse battery staple")).toBe(true);
    expect(isPasswordCorrect("Correct horse battery staple")).toBe(false);
    expect(isPasswordCorrect("correct horse battery stapl")).toBe(false);
    expect(isPasswordCorrect("")).toBe(false);
  });

  it("refuses to run at all when no password is configured", () => {
    // Failing loudly beats defaulting to something — an app that accepts every
    // password because a variable is missing is worse than one that will not
    // start.
    delete process.env.APP_PASSWORD;
    expect(() => isPasswordCorrect("anything")).toThrow(/APP_PASSWORD/);
  });
});

describe("isSessionValid", () => {
  it("accepts a token it just issued", async () => {
    expect(await isSessionValid(await createSessionToken())).toBe(true);
  });

  it("rejects nothing at all", async () => {
    expect(await isSessionValid(undefined)).toBe(false);
    expect(await isSessionValid("")).toBe(false);
  });

  it("rejects a token that has expired", async () => {
    const issued = await createSessionToken(Date.now());
    // Fourteen days and a minute later.
    const later = Date.now() + 15 * 24 * 60 * 60 * 1000;
    expect(await isSessionValid(issued, later)).toBe(false);
  });

  it("rejects an expiry someone extended", async () => {
    // The attack the signature exists to stop: take a real token and push its
    // expiry out. The payload is in the clear, so nothing but the signature
    // prevents it.
    const issued = await createSessionToken(Date.now());
    const [, signature] = issued.split(".");
    const forged = `${Date.now() + 10 * 365 * 24 * 60 * 60 * 1000}.${signature}`;

    expect(await isSessionValid(forged)).toBe(false);
  });

  it("rejects a token signed with a different secret", async () => {
    const issued = await createSessionToken();
    process.env.SESSION_SECRET = "an-entirely-different-secret-!!";
    expect(await isSessionValid(issued)).toBe(false);
  });

  it("rejects malformed tokens rather than throwing", async () => {
    for (const bad of ["no-dot", ".", "abc.def", "notanumber.signature", "12345"]) {
      expect(await isSessionValid(bad)).toBe(false);
    }
  });

  it("fails closed when the secret is missing or too short", async () => {
    const issued = await createSessionToken();
    delete process.env.SESSION_SECRET;
    // Not an exception on every request — a refusal.
    expect(await isSessionValid(issued)).toBe(false);

    process.env.SESSION_SECRET = "short";
    expect(await isSessionValid(issued)).toBe(false);
  });

  it("issues a different signature for a different expiry", async () => {
    const a = await createSessionToken(1_000_000);
    const b = await createSessionToken(2_000_000);
    expect(a.split(".")[1]).not.toBe(b.split(".")[1]);
  });
});

describe("SESSION_COOKIE_OPTIONS", () => {
  it("keeps the cookie away from scripts and off plain HTTP in production", () => {
    // httpOnly stops a script reading it; sameSite stops it riding along on a
    // cross-site request. Both are load-bearing, and both are one keystroke
    // from being turned off by accident.
    expect(SESSION_COOKIE_OPTIONS.httpOnly).toBe(true);
    expect(SESSION_COOKIE_OPTIONS.sameSite).toBe("lax");
    expect(SESSION_COOKIE_OPTIONS.path).toBe("/");
  });
});
