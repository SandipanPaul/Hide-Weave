import { describe, expect, it } from "vitest";
import { CLIENT_IMPORT_CONFIG } from "./configs/clients";
import { buildFailedRowsCsv, countByStatus, validateRows } from "./validate";

const MAPPING = {
  Name: "name",
  Phone: "phone",
  Email: "email",
  Address: "address",
  "Sampling date": "samplingDate",
};

function run(
  rows: Array<Record<string, string>>,
  mapping: Record<string, string | null> = MAPPING,
) {
  return validateRows(rows, mapping, CLIENT_IMPORT_CONFIG);
}

describe("validateRows", () => {
  it("marks a complete row valid", () => {
    const [row] = run([
      { Name: "Acme", Phone: "+91 90000 00000", Email: "a@b.com", Address: "Pune", "Sampling date": "2026-09-15" },
    ]);
    expect(row.status).toBe("valid");
    expect(row.errors).toEqual([]);
  });

  it("numbers rows from 1, ignoring the header", () => {
    const rows = run([{ Name: "A", Phone: "1" }, { Name: "B", Phone: "2" }]);
    expect(rows.map((r) => r.index)).toEqual([1, 2]);
  });

  it("errors when the required name is missing, with a readable message", () => {
    const [row] = run([{ Name: "", Phone: "+91 90000 00000" }]);
    expect(row.status).toBe("error");
    // Not a raw type error: a CSV passes no value where a form passes "".
    expect(row.errors.find((e) => e.field === "name")?.message).toBe("Name is required.");
  });

  it("errors when neither phone nor email is present, as a whole-row issue", () => {
    const [row] = run([{ Name: "Acme", Phone: "", Email: "" }]);
    expect(row.status).toBe("error");
    // Object-level rule, so it is not blamed on either field.
    expect(row.errors.some((e) => e.field === undefined)).toBe(true);
  });

  it("errors on a malformed email", () => {
    const [row] = run([{ Name: "Acme", Email: "not-an-email" }]);
    expect(row.status).toBe("error");
    expect(row.errors.some((e) => e.field === "email")).toBe(true);
  });

  it("errors on a sampling date that is malformed or impossible", () => {
    const rows = run([
      { Name: "A", Phone: "1", "Sampling date": "15/09/2026" },
      { Name: "B", Phone: "2", "Sampling date": "2026-02-31" },
    ]);
    expect(rows.every((r) => r.status === "error")).toBe(true);
    expect(rows.every((r) => r.errors.some((e) => e.field === "samplingDate"))).toBe(true);
  });

  it("warns, rather than errors, when a mapped optional column is blank", () => {
    const [row] = run([{ Name: "Acme", Phone: "+91 90000 00000", Email: "", Address: "" }]);
    expect(row.status).toBe("warning");
    expect(row.warnings.some((w) => w.field === "address")).toBe(true);
  });

  it("stays silent about optional columns that were never mapped", () => {
    const [row] = run([{ Name: "Acme", Phone: "1" }, ], { Name: "name", Phone: "phone" });
    expect(row.status).toBe("valid");
    expect(row.warnings).toEqual([]);
  });

  it("ignores unmapped columns entirely", () => {
    const [row] = run([{ Name: "Acme", Phone: "1", Junk: "whatever" }], {
      ...MAPPING,
      Junk: null,
    });
    expect(row.mapped).not.toHaveProperty("Junk");
    expect(row.status).toBe("warning"); // blank mapped optionals only
  });

  it("keeps the untouched original row for the error report", () => {
    const [row] = run([{ Name: "  Acme  ", Phone: "1" }]);
    expect(row.raw.Name).toBe("  Acme  ");
    expect(row.mapped.name).toBe("Acme");
  });
});

describe("countByStatus", () => {
  it("counts each status and the total", () => {
    const rows = run([
      { Name: "Good", Phone: "1", Email: "a@b.com", Address: "X", "Sampling date": "2026-09-15" },
      { Name: "Warn", Phone: "1", Email: "", Address: "", "Sampling date": "" },
      { Name: "", Phone: "" },
    ]);
    expect(countByStatus(rows)).toEqual({ total: 3, valid: 1, warning: 1, error: 1 });
  });

  it("counts nothing for an empty file", () => {
    expect(countByStatus([])).toEqual({ total: 0, valid: 0, warning: 0, error: 0 });
  });
});

describe("buildFailedRowsCsv", () => {
  it("returns the failed rows with an _error column, in the file's own shape", () => {
    const rows = run([
      { Name: "Fine", Phone: "1", Email: "", Address: "", "Sampling date": "" },
      { Name: "Unreachable", Phone: "", Email: "", Address: "", "Sampling date": "" },
    ]);
    const csv = buildFailedRowsCsv(rows, Object.keys(MAPPING));
    const lines = csv.split("\r\n");

    expect(lines[0]).toBe("Name,Phone,Email,Address,Sampling date,_error");
    expect(lines).toHaveLength(2); // header + the one failing row
    expect(lines[1]).toContain("at least one way to reach");
  });

  it("returns nothing when every row was fine", () => {
    const rows = run([{ Name: "Fine", Phone: "1", Email: "a@b.com", Address: "X", "Sampling date": "2026-01-01" }]);
    expect(buildFailedRowsCsv(rows, Object.keys(MAPPING))).toBe("");
  });
});
