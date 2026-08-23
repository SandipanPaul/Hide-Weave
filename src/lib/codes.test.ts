import { describe, expect, it } from "vitest";
import { CLIENT_CODES, ORDER_CODES, codeSeries } from "./codes";

describe("client codes — format", () => {
  it("pads to five digits so codes read and sort consistently", () => {
    expect(CLIENT_CODES.format(1)).toBe("HWC00001");
    expect(CLIENT_CODES.format(42)).toBe("HWC00042");
    expect(CLIENT_CODES.format(99999)).toBe("HWC99999");
  });

  it("grows rather than wrapping past five digits", () => {
    expect(CLIENT_CODES.format(100000)).toBe("HWC100000");
  });
});

describe("client codes — parse", () => {
  it("reads back what it wrote", () => {
    expect(CLIENT_CODES.parse("HWC00042")).toBe(42);
    expect(CLIENT_CODES.parse("HWC100000")).toBe(100000);
  });

  it("accepts the lower case and stray spacing a person will type", () => {
    expect(CLIENT_CODES.parse("  hwc00042 ")).toBe(42);
  });

  it("rejects anything that is not one of ours", () => {
    for (const value of ["", null, undefined, "HWC", "HW00042", "XXC00001", "HWCabc", "HWC00000"]) {
      expect(CLIENT_CODES.parse(value), String(value)).toBeNull();
    }
  });
});

describe("client codes — next", () => {
  it("starts at one when nothing exists yet", () => {
    expect(CLIENT_CODES.next([])).toBe("HWC00001");
  });

  it("continues from the highest code in use", () => {
    expect(CLIENT_CODES.next(["HWC00001", "HWC00007", "HWC00003"])).toBe("HWC00008");
  });

  it("never reuses a number freed by a deleted client", () => {
    // A reference that pointed at two different clients over time would make
    // the email it was quoted in ambiguous.
    expect(CLIENT_CODES.next(["HWC00001", "HWC00009"])).toBe("HWC00010");
  });

  it("ignores values it does not recognise rather than stalling", () => {
    expect(CLIENT_CODES.next([null, "", "legacy-3", "HWC00004"])).toBe("HWC00005");
  });

  it("keeps counting past the padded width", () => {
    expect(CLIENT_CODES.next(["HWC99999"])).toBe("HWC100000");
  });
});

describe("order codes", () => {
  it("uses a wider padding, so an order cannot be misread as a client", () => {
    expect(ORDER_CODES.format(42)).toBe("ORD00000042");
    expect(CLIENT_CODES.format(42)).toBe("HWC00042");
  });

  it("counts on from the highest order reference in use", () => {
    expect(ORDER_CODES.next(["ORD00002500", "ORD00002549"])).toBe("ORD00002550");
  });

  it("starts at one on an empty database", () => {
    expect(ORDER_CODES.next([])).toBe("ORD00000001");
  });

  it("ignores a reference in someone else's format", () => {
    // Orders imported with a client's own PO number must not stall the series.
    expect(ORDER_CODES.next(["PO/2026/17", "ORD00000009", "ORD-2500"])).toBe("ORD00000010");
  });

  it("grows past its padding rather than colliding", () => {
    expect(ORDER_CODES.next(["ORD99999999"])).toBe("ORD100000000");
  });
});

describe("codeSeries", () => {
  it("keeps two series independent", () => {
    const a = codeSeries("AA", 3);
    const b = codeSeries("BB", 3);
    expect(a.next(["BB007"])).toBe("AA001");
    expect(b.next(["AA007"])).toBe("BB001");
  });
});
