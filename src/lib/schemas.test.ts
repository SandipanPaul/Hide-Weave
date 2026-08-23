import { describe, expect, it } from "vitest";
import {
  clientInputSchema,
  formatZodError,
  makeExpenseInputSchema,
  projectInputSchema,
  samplingInputSchema,
} from "./schemas";

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

describe("projectInputSchema — the exporter split", () => {
  const base = {
    clientId: "c1",
    product: "Basmati rice",
    orderId: "ORD-1",
    quantity: "500000",
    orderValue: "2500000",
    commissionPercentage: "2.5",
    orderDate: "2026-08-01",
  };

  const parse = (exporters: unknown) =>
    projectInputSchema.safeParse({ ...base, exporters });

  it("accepts a 5,00,000 order split 2 / 2 / 1 lakh across three exporters", () => {
    const result = parse([
      { exporterId: "e1", quantity: "200000" },
      { exporterId: "e2", quantity: "200000" },
      { exporterId: "e3", quantity: "100000" },
    ]);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.exporters).toHaveLength(3);
      expect(result.data.exporters.reduce((n, e) => n + e.quantity, 0)).toBe(500_000);
    }
  });

  it("accepts a split that adds up to less than the order", () => {
    // Work that has not been placed with anyone yet.
    expect(parse([{ exporterId: "e1", quantity: "200000" }]).success).toBe(true);
  });

  it("refuses a split that adds up to more than the order", () => {
    const result = parse([
      { exporterId: "e1", quantity: "300000" },
      { exporterId: "e2", quantity: "300000" },
    ]);
    expect(result.success).toBe(false);
    if (!result.success) {
      const message = result.error.issues.map((i) => i.message).join(" ");
      expect(message).toMatch(/6,00,000.*more than.*5,00,000/);
    }
  });

  it("refuses the same exporter twice", () => {
    const result = parse([
      { exporterId: "e1", quantity: "100000" },
      { exporterId: "e1", quantity: "100000" },
    ]);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/already on the order/);
    }
  });

  it("ignores the empty row the form always renders", () => {
    const result = parse([{ exporterId: "", quantity: "" }]);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.exporters).toEqual([]);
  });

  it("refuses a quantity with nobody to make it", () => {
    // Someone started the row and did not finish it.
    expect(parse([{ exporterId: "", quantity: "1000" }]).success).toBe(false);
  });

  it("refuses an exporter with no quantity", () => {
    expect(parse([{ exporterId: "e1", quantity: "" }]).success).toBe(false);
    expect(parse([{ exporterId: "e1", quantity: "0" }]).success).toBe(false);
    expect(parse([{ exporterId: "e1", quantity: "1.5" }]).success).toBe(false);
  });

  it("accepts an order with no exporters at all", () => {
    expect(parse([]).success).toBe(true);
  });
});

describe("client status", () => {
  it("accepts the three states a client can be in", () => {
    for (const status of ["CHASING", "ACTIVE", "INACTIVE"]) {
      expect(clientInputSchema.safeParse(formLike({ status })).success, status).toBe(true);
    }
  });

  it("still defaults to ACTIVE when the column is blank", () => {
    expect(clientInputSchema.parse(formLike({ status: null })).status).toBe("ACTIVE");
  });

  it("refuses a status the app does not know", () => {
    expect(clientInputSchema.safeParse(formLike({ status: "PENDING" })).success).toBe(false);
  });
});

describe("expense input", () => {
  const expenseForm = (overrides: Record<string, unknown> = {}) => ({
    projectId: null,
    description: "Courier to Chennai",
    amount: "2500",
    incurredOn: "2026-03-12",
    category: null,
    notes: null,
    ...overrides,
  });

  const parse = (overrides: Record<string, unknown> = {}, currency = "INR") =>
    makeExpenseInputSchema(currency).safeParse(expenseForm(overrides));

  it("parses the amount into minor units of the currency it was given", () => {
    const inr = parse();
    expect(inr.success && inr.data.amount).toBe(2_500_00n);

    // Yen has no minor units, so the same digits mean a different number.
    const jpy = parse({ amount: "2500" }, "JPY");
    expect(jpy.success && jpy.data.amount).toBe(2500n);
  });

  it("requires a description — an unexplained spend is not a record", () => {
    expect(parse({ description: "" }).success).toBe(false);
    expect(parse({ description: "   " }).success).toBe(false);
  });

  it("requires an amount and a date", () => {
    expect(parse({ amount: "" }).success).toBe(false);
    expect(parse({ incurredOn: "" }).success).toBe(false);
    expect(parse({ incurredOn: "2026-02-31" }).success).toBe(false);
  });

  it("accepts an expense with no project — overheads have no order", () => {
    const result = parse({ projectId: null });
    expect(result.success && result.data.projectId).toBeUndefined();
  });

  it("leaves the category optional, and refuses one it does not know", () => {
    expect(parse({ category: null }).success).toBe(true);
    expect(parse({ category: "SHIPPING" }).success).toBe(true);
    expect(parse({ category: "BRIBES" }).success).toBe(false);
  });

  it("rejects more decimal places than the currency has", () => {
    expect(parse({ amount: "100.005" }).success).toBe(false);
  });
});

describe("order value", () => {
  const orderForm = (orderValue: string) => ({
    clientId: "c1",
    exporters: [],
    product: "Leather satchels",
    orderId: "ORD-1",
    quantity: "10",
    unit: null,
    orderValue,
    commissionPercentage: "5",
    currency: "INR",
    status: null,
    orderDate: "2026-01-01",
    expectedDelivery: null,
    actualDelivery: null,
    notes: null,
  });

  it("accepts a real consignment value", () => {
    const result = projectInputSchema.safeParse(orderForm("100000"));
    expect(result.success && result.data.orderValue).toBe(1_000_000_0n);
  });

  it("refuses a negative order value", () => {
    // Left unchecked this produced negative commission, which then flowed into
    // every total on the dashboard.
    const result = projectInputSchema.safeParse(orderForm("-100000"));
    expect(result.success).toBe(false);
    expect(result.success === false && result.error.issues[0].message).toMatch(/greater than zero/);
  });

  it("refuses a zero order value", () => {
    expect(projectInputSchema.safeParse(orderForm("0")).success).toBe(false);
    expect(projectInputSchema.safeParse(orderForm("0.00")).success).toBe(false);
  });
});
