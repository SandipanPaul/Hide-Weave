import { describe, expect, it } from "vitest";
import {
  deobfuscateEmail,
  emailKey,
  joinContacts,
  looksLikeEmail,
  phoneKey,
  splitContacts,
} from "./contacts";

describe("deobfuscateEmail", () => {
  it("turns bracketed (at) and (dot) markers into real punctuation", () => {
    // Taken from a real client list.
    expect(deobfuscateEmail("info(at)weku-trade.de")).toBe("info@weku-trade.de");
    expect(deobfuscateEmail("info [at] example [dot] com")).toBe("info@example.com");
    expect(deobfuscateEmail("info {AT} example {DOT} com")).toBe("info@example.com");
  });

  it("leaves a bare 'at' alone — it is usually part of a word", () => {
    expect(deobfuscateEmail("nathan@example.com")).toBe("nathan@example.com");
    expect(deobfuscateEmail("cat.hat@example.com")).toBe("cat.hat@example.com");
  });

  it("leaves an ordinary address untouched", () => {
    expect(deobfuscateEmail(" a.ferre@exocom.fr ")).toBe("a.ferre@exocom.fr");
  });
});

describe("splitContacts — emails", () => {
  it("splits on every delimiter people actually use", () => {
    expect(splitContacts("a@x.com/b@x.com", "EMAIL")).toEqual(["a@x.com", "b@x.com"]);
    expect(splitContacts("a@x.com, b@x.com", "EMAIL")).toEqual(["a@x.com", "b@x.com"]);
    expect(splitContacts("a@x.com; b@x.com", "EMAIL")).toEqual(["a@x.com", "b@x.com"]);
    expect(splitContacts("a@x.com\\b@x.com", "EMAIL")).toEqual(["a@x.com", "b@x.com"]);
    expect(splitContacts("a@x.com\nb@x.com", "EMAIL")).toEqual(["a@x.com", "b@x.com"]);
  });

  it("handles the four-address cell from the real client list", () => {
    const cell =
      "ruchi@aprilsourcing.com/pallavi@aprilsourcing.com/puspanjali@aprilsourcing.com/jyoti@aprilsourcing.com";
    expect(splitContacts(cell, "EMAIL")).toEqual([
      "ruchi@aprilsourcing.com",
      "pallavi@aprilsourcing.com",
      "puspanjali@aprilsourcing.com",
      "jyoti@aprilsourcing.com",
    ]);
  });

  it("de-obfuscates while splitting", () => {
    expect(splitContacts("info(at)weku-trade.de; sales(at)weku-trade.de", "EMAIL")).toEqual([
      "info@weku-trade.de",
      "sales@weku-trade.de",
    ]);
  });

  it("drops repeats that differ only by case or spacing, keeping the first", () => {
    expect(splitContacts("Info@X.com / info@x.com / INFO@X.COM", "EMAIL")).toEqual(["Info@X.com"]);
  });

  it("returns nothing for blank, missing or delimiter-only input", () => {
    expect(splitContacts("", "EMAIL")).toEqual([]);
    expect(splitContacts(null, "EMAIL")).toEqual([]);
    expect(splitContacts(undefined, "EMAIL")).toEqual([]);
    expect(splitContacts(" ; / , ", "EMAIL")).toEqual([]);
  });
});

describe("splitContacts — phones", () => {
  it("splits multiple numbers and keeps their punctuation", () => {
    expect(splitContacts("+91 98765 43210 / 022-2345 6789", "PHONE")).toEqual([
      "+91 98765 43210",
      "022-2345 6789",
    ]);
    expect(splitContacts("+1 (555) 123-4567", "PHONE")).toEqual(["+1 (555) 123-4567"]);
  });

  it("collapses stray whitespace", () => {
    expect(splitContacts("  +91   98765   43210  ", "PHONE")).toEqual(["+91 98765 43210"]);
  });

  it("ignores placeholders that contain no digits", () => {
    expect(splitContacts("-", "PHONE")).toEqual([]);
    expect(splitContacts("n/a", "PHONE")).toEqual([]);
    expect(splitContacts("N.A. / +91 90000 00000", "PHONE")).toEqual(["+91 90000 00000"]);
  });

  it("treats the same number written two ways as one", () => {
    expect(splitContacts("+919876543210 / +91 98765 43210", "PHONE")).toEqual(["+919876543210"]);
  });
});

describe("comparison keys", () => {
  it("compares emails case-insensitively", () => {
    expect(emailKey("Info@Example.COM")).toBe(emailKey("info@example.com"));
  });

  it("compares phones by their digits alone", () => {
    expect(phoneKey("+91 98765-43210")).toBe(phoneKey("+919876543210"));
    expect(phoneKey("(022) 2345 6789")).toBe("02223456789");
  });
});

describe("looksLikeEmail", () => {
  it("recognises addresses, including obfuscated ones", () => {
    expect(looksLikeEmail("a@b.com")).toBe(true);
    expect(looksLikeEmail("info(at)b.com")).toBe(true);
    expect(looksLikeEmail("+91 98765 43210")).toBe(false);
  });
});

describe("joinContacts", () => {
  it("writes values back into one readable cell", () => {
    expect(joinContacts(["a@x.com", "b@x.com"])).toBe("a@x.com; b@x.com");
    expect(joinContacts([])).toBe("");
  });
});
