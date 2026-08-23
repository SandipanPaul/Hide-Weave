import { describe, expect, it } from "vitest";
import { formatClientCode, nextClientCode, parseClientCode } from "./code";

describe("formatClientCode", () => {
  it("pads to five digits so codes read and sort consistently", () => {
    expect(formatClientCode(1)).toBe("HWC00001");
    expect(formatClientCode(42)).toBe("HWC00042");
    expect(formatClientCode(99999)).toBe("HWC99999");
  });

  it("grows rather than wrapping past five digits", () => {
    expect(formatClientCode(100000)).toBe("HWC100000");
  });
});

describe("parseClientCode", () => {
  it("reads back what it wrote", () => {
    expect(parseClientCode("HWC00042")).toBe(42);
    expect(parseClientCode("HWC100000")).toBe(100000);
  });

  it("accepts the lower case and stray spacing a person will type", () => {
    expect(parseClientCode("  hwc00042 ")).toBe(42);
  });

  it("rejects anything that is not one of ours", () => {
    for (const value of ["", null, undefined, "HWC", "HW00042", "XXC00001", "HWCabc", "HWC00000"]) {
      expect(parseClientCode(value), String(value)).toBeNull();
    }
  });
});

describe("nextClientCode", () => {
  it("starts at one when nothing exists yet", () => {
    expect(nextClientCode([])).toBe("HWC00001");
  });

  it("continues from the highest code in use", () => {
    expect(nextClientCode(["HWC00001", "HWC00007", "HWC00003"])).toBe("HWC00008");
  });

  it("never reuses a number freed by a deleted client", () => {
    // A reference that pointed at two different clients over time would make
    // the email it was quoted in ambiguous.
    expect(nextClientCode(["HWC00001", "HWC00009"])).toBe("HWC00010");
  });

  it("ignores values it does not recognise rather than stalling", () => {
    expect(nextClientCode([null, "", "legacy-3", "HWC00004"])).toBe("HWC00005");
  });

  it("keeps counting past the padded width", () => {
    expect(nextClientCode(["HWC99999"])).toBe("HWC100000");
  });
});
