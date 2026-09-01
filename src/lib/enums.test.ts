import { describe, expect, it } from "vitest";
import { parseSupplierTypes } from "@/lib/enums";

describe("parseSupplierTypes", () => {
  it("reads a stored list back", () => {
    expect(parseSupplierTypes("TANNERY,EXPORTER")).toEqual(["TANNERY", "EXPORTER"]);
  });

  it("always returns them in the same order, whatever the order stored", () => {
    // So the badges on a row do not shuffle between saves.
    expect(parseSupplierTypes("EXPORTER,TANNERY")).toEqual(["TANNERY", "EXPORTER"]);
  });

  it("drops a value the app no longer knows", () => {
    expect(parseSupplierTypes("TANNERY,WHOLESALER")).toEqual(["TANNERY"]);
  });

  it("copes with nothing, blanks and stray spaces", () => {
    expect(parseSupplierTypes(null)).toEqual([]);
    expect(parseSupplierTypes("")).toEqual([]);
    expect(parseSupplierTypes(" TANNERY , OEM_FACTORY ")).toEqual(["TANNERY", "OEM_FACTORY"]);
  });
});
