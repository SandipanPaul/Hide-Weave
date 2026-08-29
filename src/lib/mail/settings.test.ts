import { beforeEach, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "@/lib/mail/secrets";

beforeEach(() => {
  process.env.SESSION_SECRET = "a-long-enough-test-secret-value";
});

describe("encryptSecret / decryptSecret", () => {
  it("round-trips a password", () => {
    const password = "abcd efgh ijkl mnop";
    expect(decryptSecret(encryptSecret(password))).toBe(password);
  });

  it("never stores the password in the clear", () => {
    expect(encryptSecret("hunter2")).not.toContain("hunter2");
  });

  it("produces different ciphertext each time, so repeats are not obvious", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("refuses a value encrypted under a different secret", () => {
    const stored = encryptSecret("abcd efgh");
    process.env.SESSION_SECRET = "a-completely-different-secret!!";
    expect(decryptSecret(stored)).toBeNull();
  });

  it("refuses a tampered value rather than returning wrong bytes", () => {
    const [iv, tag, ciphertext] = encryptSecret("abcd efgh").split(".");
    const flipped = Buffer.from(ciphertext, "base64");
    flipped[0] ^= 0xff;
    expect(decryptSecret(`${iv}.${tag}.${flipped.toString("base64")}`)).toBeNull();
  });

  it("returns null for junk rather than throwing", () => {
    expect(decryptSecret("not-encrypted-at-all")).toBeNull();
    expect(decryptSecret("")).toBeNull();
  });

  it("round-trips non-ASCII", () => {
    expect(decryptSecret(encryptSecret("passwörd ünïcode 日本"))).toBe("passwörd ünïcode 日本");
  });
});
