import { describe, expect, it } from "vitest";
import {
  MoneyError,
  computeCommission,
  formatMoney,
  minorToMajorString,
  parseMoneyToMinor,
  sumMinor,
  weightedCommissionPercentage,
} from "./money";

describe("computeCommission", () => {
  it("computes a plain percentage of the order value", () => {
    // ₹1,00,000.00 at 2.5% = ₹2,500.00
    expect(computeCommission(10_000_000n, 2.5)).toBe(250_000n);
  });

  it("returns zero for a zero percentage and for a zero order", () => {
    expect(computeCommission(10_000_000n, 0)).toBe(0n);
    expect(computeCommission(0n, 3.75)).toBe(0n);
  });

  it("rounds halves up rather than to even", () => {
    // 1.005 -> exactly .5 of a minor unit, must round up to 1.
    expect(computeCommission(201n, 0.5)).toBe(1n); // 1.005 -> 1
    expect(computeCommission(1n, 50)).toBe(1n); // 0.5 -> 1
    expect(computeCommission(3n, 50)).toBe(2n); // 1.5 -> 2
  });

  it("rounds below the halfway point down", () => {
    expect(computeCommission(199n, 0.5)).toBe(1n); // 0.995 -> 1
    expect(computeCommission(99n, 0.5)).toBe(0n); // 0.495 -> 0
  });

  it("stays exact on values that would lose precision as floats", () => {
    // 0.1 + 0.2 style drift would show up here if floats touched the money.
    expect(computeCommission(70n, 10)).toBe(7n);
    // 2999999999999 * 3.3% = 98999999999.967 -> 99000000000 after half-up.
    expect(computeCommission(2_999_999_999_999n, 3.3)).toBe(99_000_000_000n);
  });

  it("handles order values far beyond a 32-bit integer", () => {
    // ₹500 crore in paise, well past the ~2.1e9 ceiling of a 32-bit int.
    const fiveHundredCrore = 5_000_000_000_000n;
    expect(computeCommission(fiveHundredCrore, 1.25)).toBe(62_500_000_000n);
  });

  it("keeps six decimal places of precision in the percentage", () => {
    expect(computeCommission(100_000_000n, 0.123456)).toBe(123_456n);
  });

  it("rejects percentages outside 0–100 and non-finite values", () => {
    expect(() => computeCommission(100n, -1)).toThrow(MoneyError);
    expect(() => computeCommission(100n, 100.01)).toThrow(MoneyError);
    expect(() => computeCommission(100n, Number.NaN)).toThrow(MoneyError);
    expect(() => computeCommission(100n, Number.POSITIVE_INFINITY)).toThrow(MoneyError);
  });

  it("accepts the boundary percentages", () => {
    expect(computeCommission(12_345n, 100)).toBe(12_345n);
    expect(computeCommission(12_345n, 0)).toBe(0n);
  });

  it("rounds negative amounts half-up too (toward positive infinity)", () => {
    expect(computeCommission(-3n, 50)).toBe(-1n); // -1.5 -> -1
    expect(computeCommission(-5n, 50)).toBe(-2n); // -2.5 -> -2
  });
});

describe("minorToMajorString", () => {
  it("places the decimal point by the currency's minor digits", () => {
    expect(minorToMajorString(1_234_567n, "INR")).toBe("12345.67");
    expect(minorToMajorString(5n, "USD")).toBe("0.05");
    expect(minorToMajorString(1_234n, "JPY")).toBe("1234");
  });

  it("keeps the sign and pads the fraction", () => {
    expect(minorToMajorString(-50n, "INR")).toBe("-0.50");
    expect(minorToMajorString(0n, "INR")).toBe("0.00");
  });
});

describe("parseMoneyToMinor", () => {
  it("parses plain and grouped input", () => {
    expect(parseMoneyToMinor("12345.67", "INR")).toBe(1_234_567n);
    expect(parseMoneyToMinor("12,34,567", "INR")).toBe(123_456_700n);
    expect(parseMoneyToMinor(" 42 ", "USD")).toBe(4_200n);
  });

  it("pads a short fraction", () => {
    expect(parseMoneyToMinor("10.5", "INR")).toBe(1_050n);
    expect(parseMoneyToMinor("10.", "INR")).toBe(1_000n);
  });

  it("rejects more precision than the currency has, rather than rounding silently", () => {
    expect(() => parseMoneyToMinor("100.005", "INR")).toThrow(MoneyError);
    expect(() => parseMoneyToMinor("100.5", "JPY")).toThrow(MoneyError);
  });

  it("rejects junk and empty input", () => {
    expect(() => parseMoneyToMinor("", "INR")).toThrow(MoneyError);
    expect(() => parseMoneyToMinor("abc", "INR")).toThrow(MoneyError);
    expect(() => parseMoneyToMinor("1.2.3", "INR")).toThrow(MoneyError);
  });

  it("round-trips very large values without precision loss", () => {
    const huge = "99999999999.99";
    expect(minorToMajorString(parseMoneyToMinor(huge, "INR"), "INR")).toBe(huge);
  });
});

describe("formatMoney", () => {
  it("formats INR with lakh/crore grouping", () => {
    // Non-breaking spaces vary by ICU build, so compare on digits only.
    expect(formatMoney(123_456_700n, "INR").replace(/\s/g, "")).toContain("12,34,567.00");
  });

  it("renders an unrecognised but well-formed code as a plain prefix", () => {
    // ICU emits a non-breaking space here, so normalise before comparing.
    expect(formatMoney(1_000n, "XXY").replace(/\s/g, " ")).toBe("XXY 10.00");
  });
});

describe("aggregates", () => {
  it("sums an empty list to zero", () => {
    expect(sumMinor([])).toBe(0n);
  });

  it("weights the average commission by order value, not by row count", () => {
    const rows = [
      { orderValue: 100_000_000n, commissionPercentage: 1 }, // large, low rate
      { orderValue: 1_000_000n, commissionPercentage: 10 }, // small, high rate
    ];
    // A naive mean would say 5.5%; weighting by value gives ~1.09%.
    expect(weightedCommissionPercentage(rows)).toBeCloseTo(1.089, 2);
  });

  it("returns zero rather than dividing by zero when there is no value", () => {
    expect(weightedCommissionPercentage([])).toBe(0);
    expect(weightedCommissionPercentage([{ orderValue: 0n, commissionPercentage: 5 }])).toBe(0);
  });
});
