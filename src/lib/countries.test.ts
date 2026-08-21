import { describe, expect, it } from "vitest";
import { COUNTRY_OPTIONS, countryName, resolveCountry } from "./countries";

describe("resolveCountry", () => {
  it("accepts a canonical name", () => {
    expect(resolveCountry("India")).toBe("IN");
    expect(resolveCountry("United Kingdom")).toBe("GB");
  });

  it("accepts an alpha-2 code in any case", () => {
    expect(resolveCountry("IN")).toBe("IN");
    expect(resolveCountry("in")).toBe("IN");
  });

  it("accepts everyday aliases a CSV is likely to contain", () => {
    expect(resolveCountry("USA")).toBe("US");
    expect(resolveCountry("U.S.A.")).toBe("US");
    expect(resolveCountry("UK")).toBe("GB");
    expect(resolveCountry("England")).toBe("GB");
    expect(resolveCountry("UAE")).toBe("AE");
    expect(resolveCountry("South Korea")).toBe("KR");
    expect(resolveCountry("Turkey")).toBe("TR");
    expect(resolveCountry("Ivory Coast")).toBe("CI");
  });

  it("ignores case, accents, punctuation and surrounding space", () => {
    expect(resolveCountry("  türkiye ")).toBe("TR");
    expect(resolveCountry("Turkiye")).toBe("TR");
    expect(resolveCountry("côte d'ivoire")).toBe("CI");
    expect(resolveCountry("Cote dIvoire")).toBe("CI");
  });

  it("returns null for blanks rather than guessing", () => {
    expect(resolveCountry("")).toBeNull();
    expect(resolveCountry("   ")).toBeNull();
    expect(resolveCountry(null)).toBeNull();
    expect(resolveCountry(undefined)).toBeNull();
  });

  it("returns null for anything unrecognised", () => {
    expect(resolveCountry("Atlantis")).toBeNull();
    expect(resolveCountry("ZZ")).toBeNull();
    expect(resolveCountry("123")).toBeNull();
  });

  it("is idempotent: resolving its own output returns the same code", () => {
    for (const option of COUNTRY_OPTIONS) {
      expect(resolveCountry(option.code)).toBe(option.code);
      expect(resolveCountry(option.name)).toBe(option.code);
    }
  });
});

describe("countryName", () => {
  it("turns a code into a readable name", () => {
    expect(countryName("IN")).toBe("India");
    expect(countryName("gb")).toBe("United Kingdom");
  });

  it("returns an empty string for no country, not the word undefined", () => {
    expect(countryName(null)).toBe("");
    expect(countryName(undefined)).toBe("");
    expect(countryName("")).toBe("");
  });
});

describe("COUNTRY_OPTIONS", () => {
  it("covers the ISO list and is sorted by name", () => {
    expect(COUNTRY_OPTIONS.length).toBeGreaterThan(240);
    const names = COUNTRY_OPTIONS.map((option) => option.name);
    expect([...names].sort((a, b) => a.localeCompare(b))).toEqual(names);
  });

  it("has no duplicate codes", () => {
    const codes = COUNTRY_OPTIONS.map((option) => option.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
