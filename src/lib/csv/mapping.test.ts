import { describe, expect, it } from "vitest";
import { CLIENT_IMPORT_CONFIG } from "./configs/clients";
import {
  applyMapping,
  buildTemplateCsv,
  csvEscape,
  guessMapping,
  mappedFieldKeys,
  missingRequiredFields,
  normalizeHeader,
  rowsToCsv,
} from "./mapping";

const FIELDS = CLIENT_IMPORT_CONFIG.fields;

describe("normalizeHeader", () => {
  it("collapses case, spaces, underscores, hyphens and punctuation", () => {
    const expected = "contactperson";
    for (const header of ["Contact Person", "contact_person", "CONTACT-PERSON", "Contact.Person"]) {
      expect(normalizeHeader(header)).toBe(expected);
    }
  });

  it("survives stray characters without collapsing to nothing", () => {
    expect(normalizeHeader("E-mail (primary)")).toBe("emailprimary");
  });
});

describe("guessMapping", () => {
  it("matches headers by exact name, ignoring case and spacing", () => {
    const mapping = guessMapping(["Name", "E Mail", "phone_number"], FIELDS);
    expect(mapping).toEqual({ Name: "name", "E Mail": "email", phone_number: "phone" });
  });

  it("matches known aliases", () => {
    const mapping = guessMapping(["Company", "Mobile", "Attn", "Remarks"], FIELDS);
    expect(mapping).toEqual({
      Company: "name",
      Mobile: "phone",
      Attn: "contactPerson",
      Remarks: "notes",
    });
  });

  it("leaves unrecognised headers unmapped rather than guessing wildly", () => {
    const mapping = guessMapping(["Name", "Internal Ref", "Salesforce ID"], FIELDS);
    expect(mapping["Internal Ref"]).toBeNull();
    expect(mapping["Salesforce ID"]).toBeNull();
  });

  it("never maps two headers onto the same field", () => {
    // Both would match `email`; the second must be left for the user to decide.
    const mapping = guessMapping(["Email", "Email Address"], FIELDS);
    expect(mapping.Email).toBe("email");
    expect(mapping["Email Address"]).toBeNull();
  });

  it("recognises the headers of a real-world client spreadsheet", () => {
    // Verbatim from a working client list, quirks and all.
    const mapping = guessMapping(
      ["SL.NO", "BUYER'S NAME", "ADDRESS", "EMAIL ID.", "CONTACT NO.", "COUNTRY", "REMARKS"],
      FIELDS,
    );
    expect(mapping).toEqual({
      "SL.NO": null,
      "BUYER'S NAME": "name",
      ADDRESS: "address",
      "EMAIL ID.": "email",
      "CONTACT NO.": "phone",
      COUNTRY: "country",
      REMARKS: "notes",
    });
  });

  it("handles an empty file and a file of only unknown headers", () => {
    expect(guessMapping([], FIELDS)).toEqual({});
    expect(guessMapping(["zzz"], FIELDS)).toEqual({ zzz: null });
  });
});

describe("applyMapping", () => {
  const mapping = { "Client Name": "name", "E Mail": "email", Junk: null };

  it("renames mapped columns and drops unmapped ones", () => {
    const result = applyMapping(
      { "Client Name": "Acme", "E Mail": "a@b.com", Junk: "ignore me" },
      mapping,
    );
    expect(result).toEqual({ name: "Acme", email: "a@b.com" });
  });

  it("trims cells and turns blanks into undefined, not empty strings", () => {
    const result = applyMapping({ "Client Name": "  Acme  ", "E Mail": "   ", Junk: "" }, mapping);
    expect(result.name).toBe("Acme");
    expect(result.email).toBeUndefined();
  });

  it("treats a column missing from the row as absent", () => {
    expect(applyMapping({ "Client Name": "Acme" }, mapping).email).toBeUndefined();
  });
});

describe("mappedFieldKeys and missingRequiredFields", () => {
  it("lists mapped fields in config order, not file order", () => {
    const mapping = { Email: "email", Name: "name" };
    expect(mappedFieldKeys(mapping, FIELDS)).toEqual(["name", "email"]);
  });

  it("reports a required field with no column pointed at it", () => {
    const missing = missingRequiredFields({ Email: "email" }, FIELDS);
    expect(missing.map((f) => f.key)).toEqual(["name"]);
  });

  it("reports nothing when every required field is mapped", () => {
    expect(missingRequiredFields({ Name: "name" }, FIELDS)).toEqual([]);
  });
});

describe("csv writing", () => {
  it("quotes only cells that need it", () => {
    expect(csvEscape("plain")).toBe("plain");
    expect(csvEscape("has,comma")).toBe('"has,comma"');
    expect(csvEscape('has"quote')).toBe('"has""quote"');
    expect(csvEscape("has\nnewline")).toBe('"has\nnewline"');
    expect(csvEscape(undefined)).toBe("");
  });

  it("writes headers and rows, filling absent cells", () => {
    const csv = rowsToCsv(["a", "b"], [{ a: "1", b: "2" }, { a: "3" }]);
    expect(csv).toBe("a,b\r\n1,2\r\n3,");
  });

  it("round-trips a value containing a comma and a quote", () => {
    const nasty = 'Smith, "Jo"';
    const csv = rowsToCsv(["name"], [{ name: nasty }]);
    expect(csv).toBe('name\r\n"Smith, ""Jo"""');
  });
});

describe("buildTemplateCsv", () => {
  it("emits every field as a header with one example row", () => {
    const csv = buildTemplateCsv(CLIENT_IMPORT_CONFIG);
    const [header, example, ...rest] = csv.split("\r\n");

    expect(header).toContain("Name");
    expect(header).toContain("Sampling date");
    expect(example).toContain("Meridian Foods Ltd");
    expect(rest).toHaveLength(0);
  });

  it("produces headers the guesser maps straight back onto the fields", () => {
    // The template must round-trip: a user downloads it, fills it in, uploads
    // it, and every column should be recognised automatically.
    const [header] = buildTemplateCsv(CLIENT_IMPORT_CONFIG).split("\r\n");
    const headers = header.split(",");
    const mapping = guessMapping(headers, FIELDS);

    expect(Object.values(mapping).filter((v) => v === null)).toHaveLength(0);
    expect(new Set(Object.values(mapping)).size).toBe(FIELDS.length);
  });
});
