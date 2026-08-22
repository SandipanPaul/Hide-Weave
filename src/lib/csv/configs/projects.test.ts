import { describe, expect, it } from "vitest";
import { buildProjectImportConfig } from "./projects";
import { guessMapping } from "../mapping";

const CLIENTS = [
  { id: "cl-1", name: "Meridian Foods Ltd" },
  { id: "cl-2", name: "Konkan Marine Exports" },
];
const EXPORTERS = [
  { id: "ex-1", name: "Gujarat Spice Works" },
  { id: "ex-2", name: "Rann Leather Co" },
];

const config = buildProjectImportConfig(CLIENTS, EXPORTERS);

/** A row that should import cleanly, for tests to break one field at a time. */
const validRow = {
  orderId: "ORD-1",
  clientName: "Meridian Foods Ltd",
  product: "Basmati rice",
  quantity: "1000",
  orderValue: "2500000.00",
  commissionPercentage: "2.5",
  orderDate: "2026-08-01",
};

const check = (row: Record<string, string | undefined>, mapped = Object.keys(validRow)) =>
  config.validateRow(row, mapped);

const messagesFor = (row: Record<string, string | undefined>, field: string) =>
  check(row)
    .errors.filter((issue) => issue.field === field)
    .map((issue) => issue.message);

describe("project import validation", () => {
  it("accepts a complete row", () => {
    expect(check(validRow).errors).toEqual([]);
  });

  it("resolves the client by name, ignoring case and stray spacing", () => {
    expect(check({ ...validRow, clientName: "  meridian   foods ltd " }).errors).toEqual([]);
  });

  it("names the client it could not find, rather than saying 'required'", () => {
    const messages = messagesFor({ ...validRow, clientName: "Meridian Foods" }, "clientName");
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("No client called");
    // The underlying schema also fails on the blank id; that must not surface
    // as a second, less useful message about the same column.
    expect(messages[0]).not.toContain("required");
  });

  it("refuses an unknown exporter rather than silently importing without one", () => {
    const messages = messagesFor({ ...validRow, exporterName: "Nobody Ltd" }, "exporterName");
    expect(messages[0]).toContain("No exporter called");
  });

  it("imports without an exporter when the column is blank", () => {
    expect(check({ ...validRow, exporterName: undefined }).errors).toEqual([]);
  });

  it("reports schema errors against the CSV column, not the schema field", () => {
    // The schema calls it clientId; the file calls it Client.
    const fields = check({ ...validRow, clientName: undefined }).errors.map((i) => i.field);
    expect(fields).toContain("clientName");
    expect(fields).not.toContain("clientId");
  });

  it("rejects a malformed order value with a message about money", () => {
    expect(messagesFor({ ...validRow, orderValue: "2.5 lakh" }, "orderValue")[0]).toMatch(
      /plain number/i,
    );
  });

  it("rejects more decimal places than the currency has", () => {
    expect(
      messagesFor({ ...validRow, orderValue: "100.005", currency: "INR" }, "orderValue")[0],
    ).toMatch(/at most 2 decimal/i);
  });

  it("rejects a commission percentage outside 0–100", () => {
    expect(messagesFor({ ...validRow, commissionPercentage: "120" }, "commissionPercentage"))
      .toHaveLength(1);
    expect(messagesFor({ ...validRow, commissionPercentage: "-1" }, "commissionPercentage"))
      .toHaveLength(1);
    expect(check({ ...validRow, commissionPercentage: "0" }).errors).toEqual([]);
  });

  it("rejects a quantity that is not a whole positive number", () => {
    expect(messagesFor({ ...validRow, quantity: "0" }, "quantity")).toHaveLength(1);
    expect(messagesFor({ ...validRow, quantity: "1.5" }, "quantity")).toHaveLength(1);
  });

  it("rejects a date that does not exist", () => {
    expect(messagesFor({ ...validRow, orderDate: "2026-02-31" }, "orderDate")[0]).toContain(
      "doesn't exist",
    );
  });

  it("rejects an unknown status rather than defaulting it", () => {
    expect(messagesFor({ ...validRow, status: "PENDING" }, "status")).toHaveLength(1);
    expect(check({ ...validRow, status: "SHIPPED" }).errors).toEqual([]);
  });

  it("warns about a mapped column left blank, but stays quiet about optional ones", () => {
    const withOptional = check({ ...validRow, product: undefined }, [
      ...Object.keys(validRow),
      "notes",
      "unit",
    ]);
    const warned = withOptional.warnings.map((issue) => issue.field);
    // Notes and unit being empty is normal; a missing product is worth seeing.
    expect(warned).toContain("product");
    expect(warned).not.toContain("notes");
    expect(warned).not.toContain("unit");
  });
});

describe("project header guessing", () => {
  it("recognises the vocabulary a real order sheet uses", () => {
    const mapping = guessMapping(
      ["PO No.", "Buyer's Name", "Item", "QTY", "Total Value", "Comm %", "PO Date", "Supplier"],
      config.fields,
    );
    expect(mapping).toEqual({
      "PO No.": "orderId",
      "Buyer's Name": "clientName",
      Item: "product",
      QTY: "quantity",
      "Total Value": "orderValue",
      "Comm %": "commissionPercentage",
      "PO Date": "orderDate",
      Supplier: "exporterName",
    });
  });
});

describe("the exporter column", () => {
  const withExporter = (exporterName: string, quantity = "1000") =>
    config.validateRow({ ...validRow, quantity, exporterName }, [
      ...Object.keys(validRow),
      "exporterName",
    ]);

  it("gives a lone named exporter the whole order", () => {
    expect(withExporter("Gujarat Spice Works").errors).toEqual([]);
  });

  it("reads a split written as name and quantity", () => {
    // "Acme: 2000; Best Ltd: 3000" is how a split arrives from a spreadsheet.
    const result = config.validateRow(
      {
        ...validRow,
        quantity: "5000",
        exporterName: "Gujarat Spice Works: 2000; Rann Leather Co: 3000",
      },
      [...Object.keys(validRow), "exporterName"],
    );
    expect(result.errors).toEqual([]);
  });

  it("refuses a split that exceeds the order", () => {
    const result = config.validateRow(
      {
        ...validRow,
        quantity: "1000",
        exporterName: "Gujarat Spice Works: 800; Rann Leather Co: 800",
      },
      [...Object.keys(validRow), "exporterName"],
    );
    expect(result.errors.map((i) => i.message).join(" ")).toMatch(/more than/);
  });

  it("asks for quantities once more than one exporter is named", () => {
    const result = config.validateRow(
      { ...validRow, exporterName: "Gujarat Spice Works; Rann Leather Co" },
      [...Object.keys(validRow), "exporterName"],
    );
    expect(result.errors[0].message).toMatch(/Give .* a quantity/);
  });

  it("does not split on commas, which company names contain", () => {
    // "Kutch Salt & Minerals, Bhuj" is one exporter, not two.
    const result = withExporter("Nobody, Somewhere");
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("Nobody, Somewhere");
  });

  it("ignores thousands separators in a quantity", () => {
    const result = config.validateRow(
      { ...validRow, quantity: "5000", exporterName: "Gujarat Spice Works: 2,500" },
      [...Object.keys(validRow), "exporterName"],
    );
    expect(result.errors).toEqual([]);
  });

  it("names a quantity it cannot read", () => {
    const result = withExporter("Gujarat Spice Works: lots");
    expect(result.errors[0].message).toMatch(/is not a quantity/);
  });
});
