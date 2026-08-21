import { describe, expect, it } from "vitest";
import { clientInputSchema, formatZodError, samplingInputSchema } from "./schemas";

/** Mimics what a server action receives: absent fields arrive as null. */
function formLike(overrides: Record<string, unknown> = {}) {
  return {
    name: "Meridian Foods",
    address: null,
    country: null,
    phones: "+44 20 7946 0000",
    emails: null,
    website: null,
    contactPerson: null,
    status: null,
    fixedMonthly: null,
    currency: null,
    notes: null,
    ...overrides,
  };
}

describe("clientInputSchema", () => {
  it("accepts a client reachable by phone alone", () => {
    const result = clientInputSchema.safeParse(formLike());
    expect(result.success).toBe(true);
  });

  it("accepts a client reachable by email alone", () => {
    const result = clientInputSchema.safeParse(
      formLike({ phones: null, emails: "orders@meridian.example.com" }),
    );
    expect(result.success).toBe(true);
  });

  it("rejects a client with neither phone nor email, at form level", () => {
    const result = clientInputSchema.safeParse(formLike({ phones: null, emails: null }));
    expect(result.success).toBe(false);
    if (result.success) return;

    const { formErrors, fieldErrors } = formatZodError(result.error);
    // The message belongs to the object, not to either field — blaming one of
    // them would be wrong, since filling the other also resolves it.
    expect(formErrors.join(" ")).toContain("at least one way to reach");
    expect(fieldErrors.phones).toBeUndefined();
    expect(fieldErrors.emails).toBeUndefined();
  });

  it("treats blank strings the same as absent fields", () => {
    const result = clientInputSchema.safeParse(
      formLike({ phones: "   ", emails: "", address: "  " }),
    );
    expect(result.success).toBe(false);
  });

  it("trims text and drops empty optionals rather than storing empty strings", () => {
    const result = clientInputSchema.parse(
      formLike({ name: "  Meridian Foods  ", address: "", contactPerson: " Tom W " }),
    );
    expect(result.name).toBe("Meridian Foods");
    expect(result.address).toBeUndefined();
    expect(result.contactPerson).toBe("Tom W");
  });

  it("applies defaults when the field is absent entirely", () => {
    const result = clientInputSchema.parse(formLike());
    expect(result.status).toBe("ACTIVE");
    expect(result.currency).toBe("INR");
  });

  it("validates an email only when one is given", () => {
    const bad = clientInputSchema.safeParse(formLike({ emails: "not-an-email" }));
    expect(bad.success).toBe(false);
    if (!bad.success) {
      expect(formatZodError(bad.error).fieldErrors.emails?.[0]).toContain("valid email");
    }
  });

  it("parses a retainer into minor units in the client's currency", () => {
    const result = clientInputSchema.parse(formLike({ fixedMonthly: "2500.50", currency: "inr" }));
    expect(result.fixedMonthly).toBe(250_050n);
    expect(result.currency).toBe("INR");
  });

  it("reports an unparseable retainer against its own field", () => {
    const result = clientInputSchema.safeParse(formLike({ fixedMonthly: "2,500.999" }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(formatZodError(result.error).fieldErrors.fixedMonthly?.[0]).toContain("decimal");
    }
  });

  it("stores a country as its alpha-2 code, however it was typed", () => {
    expect(clientInputSchema.parse(formLike({ country: "India" })).country).toBe("IN");
    expect(clientInputSchema.parse(formLike({ country: "usa" })).country).toBe("US");
    expect(clientInputSchema.parse(formLike({ country: "  gb " })).country).toBe("GB");
  });

  it("treats a blank country as no country", () => {
    expect(clientInputSchema.parse(formLike({ country: "" })).country).toBeUndefined();
    expect(clientInputSchema.parse(formLike()).country).toBeUndefined();
  });

  it("rejects an unrecognised country rather than storing it raw", () => {
    const result = clientInputSchema.safeParse(formLike({ country: "Atlantis" }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(formatZodError(result.error).fieldErrors.country?.[0]).toContain("not a country");
    }
  });

  it("accepts several phone numbers and addresses from one cell", () => {
    const result = clientInputSchema.parse(
      formLike({
        phones: "+91 90000 11111 / 022-2345 6789",
        emails: "m.baer@kenago.com/pm7@kenago.com",
      }),
    );
    expect(result.phones).toEqual(["+91 90000 11111", "022-2345 6789"]);
    expect(result.emails).toEqual(["m.baer@kenago.com", "pm7@kenago.com"]);
  });

  it("accepts repeated form fields as well as one packed cell", () => {
    const result = clientInputSchema.parse(
      formLike({ emails: ["a@x.com", "b@x.com; c@x.com"] }),
    );
    expect(result.emails).toEqual(["a@x.com", "b@x.com", "c@x.com"]);
  });

  it("reads an obfuscated address as a real one", () => {
    expect(clientInputSchema.parse(formLike({ emails: "info(at)weku-trade.de" })).emails).toEqual([
      "info@weku-trade.de",
    ]);
  });

  it("accepts a bare domain and stores it canonically", () => {
    // What people actually type. Assuming https beats a lecture about schemes.
    expect(clientInputSchema.parse(formLike({ website: "meridian.example.com" })).website).toBe(
      "https://meridian.example.com",
    );
    expect(
      clientInputSchema.parse(formLike({ website: "HTTPS://WWW.Meridian.example.com/" })).website,
    ).toBe("https://www.meridian.example.com");
  });

  it("still rejects something that is not a web address at all", () => {
    expect(clientInputSchema.safeParse(formLike({ website: "not a website" })).success).toBe(false);
    expect(
      clientInputSchema.safeParse(formLike({ website: "mailto:x@example.com" })).success,
    ).toBe(false);
  });
});

describe("samplingInputSchema", () => {
  it("accepts a date with optional product and notes omitted", () => {
    const result = samplingInputSchema.parse({
      clientId: "abc",
      scheduledDate: "2026-09-01",
      product: null,
      status: null,
      notes: null,
    });
    expect(result.status).toBe("SCHEDULED");
    expect(result.product).toBeUndefined();
  });

  it("rejects a malformed or impossible date", () => {
    expect(
      samplingInputSchema.safeParse({ clientId: "a", scheduledDate: "01/09/2026" }).success,
    ).toBe(false);
    expect(
      samplingInputSchema.safeParse({ clientId: "a", scheduledDate: "2026-02-31" }).success,
    ).toBe(false);
  });
});
