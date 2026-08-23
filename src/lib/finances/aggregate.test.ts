import { describe, expect, it } from "vitest";
import {
  cashByMonth,
  lateDeliveries,
  monthlyRetainer,
  monthsBetween,
  outstandingOf,
  overdueReceivables,
  receivedOn,
  commissionOf,
  expensesByCategory,
  passbook,
  summarise,
  type FinanceExpense,
  type FinanceReceipt,
  type FinanceProject,
} from "./aggregate";
import type { ProjectStatus } from "@/lib/enums";
import type { FinanceRetainer } from "./aggregate";

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** Amounts are minor units: 1_00_000_00n is ₹1,00,000.00. */
function project(overrides: Partial<FinanceProject> = {}): FinanceProject {
  return {
    id: "p1",
    clientId: "c1",
    clientName: "Meridian Foods",
    product: "Basmati rice",
    orderId: "ORD-1",
    clientReference: null,
    orderValue: 100_000_00n,
    commissionPercentage: 2,
    status: "DELIVERED" as ProjectStatus,
    orderDate: utc("2026-03-10"),
    expectedDelivery: null,
    actualDelivery: utc("2026-04-10"),
    payments: [],
    ...overrides,
  };
}

/** A commission receipt, which is what almost every test wants. */
function receipt(
  id: string,
  amount: bigint,
  paidOn: Date,
  overrides: Partial<FinanceReceipt> = {},
): FinanceReceipt {
  return {
    id,
    amount,
    paidOn,
    projectId: "p1",
    orderId: "ORD-1",
    orderExists: true,
    clientName: "Meridian Foods",
    ...overrides,
  };
}

/** A retainer fee received, as the client page logs it. */
function retainerFee(id: string, amount: bigint, paidOn: Date): FinanceRetainer {
  return { id, clientId: "c1", clientName: "Meridian Foods", amount, paidOn };
}

describe("summarise", () => {
  it("keeps order value and commission apart", () => {
    // ₹1,00,000 at 2% earns ₹2,000. The two must never be conflated.
    const result = summarise([project()], []);
    expect(result.orderValue).toBe(100_000_00n);
    expect(result.commission).toBe(2_000_00n);
    expect(result.commission).not.toBe(result.orderValue);
  });

  it("excludes cancelled orders from money, but still counts them by status", () => {
    const result = summarise(
      [project(), project({ id: "p2", status: "CANCELLED", orderValue: 500_000_00n })],
      [],
    );
    expect(result.orderValue).toBe(100_000_00n);
    expect(result.activeProjects).toBe(1);
    // The order happened, so the status breakdown still shows it.
    expect(result.byStatus.find((s) => s.status === "CANCELLED")?.count).toBe(1);
  });

  it("weights the average commission by order value, not by order count", () => {
    // A tiny 10% order must not drag the average up to 6%.
    const result = summarise(
      [
        project({ id: "big", orderValue: 1_000_000_00n, commissionPercentage: 2 }),
        project({ id: "small", orderValue: 1_000_00n, commissionPercentage: 10 }),
      ],
      [],
    );
    expect(result.averageCommissionPercentage).toBeCloseTo(2.008, 2);
  });

  it("counts cash by when it was paid, not by when the order was placed", () => {
    const payments = [
      receipt("a", 1_500_00n, utc("2026-05-02")),
      receipt("b", 500_00n, utc("2026-06-11")),
    ];
    expect(summarise([project()], payments).moneyIn).toBe(2_000_00n);
  });

  it("settles outstanding against commission, never against order value", () => {
    const paid = project({ payments: [{ amount: 500_00n, paidOn: utc("2026-05-01") }] });
    const result = summarise([paid], []);
    // ₹2,000 earned, ₹500 received, ₹1,500 still owed — not ₹99,500.
    expect(result.outstanding).toBe(1_500_00n);
  });

  it("counts every payment against outstanding, even one made outside the range", () => {
    // Outstanding is a balance as of now, not an in-period flow: a January
    // payment against a March order still reduces what is owed.
    const paid = project({ payments: [{ amount: 2_000_00n, paidOn: utc("2020-01-01") }] });
    expect(summarise([paid], []).outstanding).toBe(0n);
  });

  it("treats an overpayment as settled rather than as a negative debt", () => {
    const over = project({ payments: [{ amount: 5_000_00n, paidOn: utc("2026-05-01") }] });
    expect(outstandingOf(over)).toBe(0n);
    expect(summarise([over], []).outstanding).toBe(0n);
  });

  it("puts only undelivered commission at risk", () => {
    const shipped = project({ id: "s", status: "SHIPPED" });
    const delivered = project({ id: "d", status: "DELIVERED" });
    const result = summarise([shipped, delivered], []);

    // Both are unpaid, so both are outstanding…
    expect(result.outstanding).toBe(4_000_00n);
    // …but only the undelivered one is at risk: the other's goods have landed.
    expect(result.atRisk).toBe(2_000_00n);
  });

  it("reports nothing rather than dividing by zero when there is no data", () => {
    const result = summarise([], []);
    expect(result).toMatchObject({
      orderValue: 0n,
      commission: 0n,
      averageCommissionPercentage: 0,
      moneyIn: 0n,
      outstanding: 0n,
      atRisk: 0n,
      activeProjects: 0,
    });
  });
});

describe("monthlyRetainer", () => {
  it("adds up what active clients are charged each month", () => {
    expect(
      monthlyRetainer([
        { fixedMonthly: 25_000_00n, status: "ACTIVE" },
        { fixedMonthly: 10_000_00n, status: "ACTIVE" },
        { fixedMonthly: null, status: "ACTIVE" },
      ]),
    ).toBe(35_000_00n);
  });

  it("ignores inactive clients, who are not being billed", () => {
    expect(
      monthlyRetainer([
        { fixedMonthly: 25_000_00n, status: "ACTIVE" },
        { fixedMonthly: 99_000_00n, status: "INACTIVE" },
      ]),
    ).toBe(25_000_00n);
  });

  it("is a rate, not income — it never counts as money received", () => {
    const result = summarise([project()], [], [], []);
    expect(result.retainerReceived).toBe(0n);
    expect(monthlyRetainer([{ fixedMonthly: 50_000_00n, status: "ACTIVE" }])).toBe(50_000_00n);
  });
});

describe("cash series", () => {
  it("includes months with nothing in them", () => {
    // A gap must read as a quiet month, not as a missing one.
    const points = cashByMonth(
      [{ amount: 2_000_00n, paidOn: utc("2026-03-15") }],
      utc("2026-02-01"),
      utc("2026-04-30"),
    );
    expect(points.map((p) => p.month)).toEqual(["2026-02", "2026-03", "2026-04"]);
    expect(points[0].amount).toBe(0n);
    expect(points[1].amount).toBe(2_000_00n);
  });

  it("buckets cash by the date it arrived, not by the order's date", () => {
    const paid = project({
      orderDate: utc("2026-03-10"),
      payments: [{ amount: 2_000_00n, paidOn: utc("2026-05-20") }],
    });
    const cash = cashByMonth(paid.payments, utc("2026-03-01"), utc("2026-05-31"));
    expect(cash.find((p) => p.month === "2026-05")?.amount).toBe(2_000_00n);
    expect(cash.find((p) => p.month === "2026-03")?.amount).toBe(0n);
  });

  it("ignores anything outside the range rather than folding it into an edge month", () => {
    const points = cashByMonth(
      [{ amount: 5_000_00n, paidOn: utc("2025-01-01") }],
      utc("2026-01-01"),
      utc("2026-02-28"),
    );
    expect(points.every((point) => point.amount === 0n)).toBe(true);
  });

  it("spans a year boundary", () => {
    expect(monthsBetween(utc("2025-11-05"), utc("2026-02-20"))).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
  });
});

describe("overdueReceivables", () => {
  const today = utc("2026-06-30");

  it("lists delivered orders that still owe, longest-waiting first", () => {
    const rows = overdueReceivables(
      [
        project({ id: "old", orderId: "ORD-OLD", actualDelivery: utc("2026-01-15") }),
        project({ id: "recent", orderId: "ORD-NEW", actualDelivery: utc("2026-06-01") }),
      ],
      today,
    );
    expect(rows.map((row) => row.orderId)).toEqual(["ORD-OLD", "ORD-NEW"]);
    expect(rows[0].daysOutstanding).toBe(166);
  });

  it("leaves out orders that are fully settled", () => {
    const settled = project({ payments: [{ amount: 2_000_00n, paidOn: utc("2026-05-01") }] });
    expect(overdueReceivables([settled], today)).toEqual([]);
  });

  it("leaves out orders whose goods have not landed yet", () => {
    // Not yet delivered is not the same as overdue.
    expect(overdueReceivables([project({ status: "SHIPPED" })], today)).toEqual([]);
  });

  it("shows a part-paid order for what is still owed", () => {
    const part = project({ payments: [{ amount: 500_00n, paidOn: utc("2026-05-01") }] });
    const [row] = overdueReceivables([part], today);
    expect(row).toMatchObject({ commission: 2_000_00n, paid: 500_00n, outstanding: 1_500_00n });
  });
});

describe("lateDeliveries", () => {
  const today = utc("2026-06-30");

  it("lists undelivered orders past their expected date, latest first", () => {
    const rows = lateDeliveries(
      [
        project({
          id: "late",
          orderId: "ORD-LATE",
          status: "IN_PRODUCTION",
          expectedDelivery: utc("2026-05-01"),
          actualDelivery: null,
        }),
        project({
          id: "later",
          orderId: "ORD-LATER",
          status: "CONFIRMED",
          expectedDelivery: utc("2026-03-01"),
          actualDelivery: null,
        }),
      ],
      today,
    );
    expect(rows.map((row) => row.orderId)).toEqual(["ORD-LATER", "ORD-LATE"]);
    expect(rows[0].daysLate).toBe(121);
  });

  it("leaves out orders that arrived, however late", () => {
    const arrived = project({
      status: "DELIVERED",
      expectedDelivery: utc("2026-01-01"),
      actualDelivery: utc("2026-05-01"),
    });
    expect(lateDeliveries([arrived], today)).toEqual([]);
  });

  it("leaves out orders with no expected date to be late against", () => {
    expect(lateDeliveries([project({ status: "SHIPPED", expectedDelivery: null })], today)).toEqual(
      [],
    );
  });

  it("leaves out cancelled orders, which are not going to arrive", () => {
    const cancelled = project({
      status: "CANCELLED",
      expectedDelivery: utc("2026-01-01"),
      actualDelivery: null,
    });
    expect(lateDeliveries([cancelled], today)).toEqual([]);
  });
});

describe("expenses", () => {
  const expense = (overrides: Partial<FinanceExpense> = {}): FinanceExpense => ({
    id: "e1",
    amount: 500_00n,
    incurredOn: utc("2026-03-12"),
    description: "Courier to Chennai",
    category: "SHIPPING",
    notes: null,
    projectId: "p1",
    orderId: "ORD-1",
    orderExists: true,
    clientId: null,
    clientName: null,
    ...overrides,
  });

  it("deducts expenses from commission without touching what a client owes", () => {
    const result = summarise([project()], [], [expense()]);

    expect(result.commission).toBe(2_000_00n);
    expect(result.expenses).toBe(500_00n);
    expect(result.netEarned).toBe(1_500_00n);
    // The client still owes the full commission: the agent's costs are not
    // the client's business.
    expect(result.outstanding).toBe(2_000_00n);
  });

  it("nets cash received against cash spent", () => {
    const result = summarise(
      [project()],
      [receipt("r1", 1_200_00n, utc("2026-04-01"))],
      [expense({ amount: 300_00n })],
    );
    expect(result.moneyIn).toBe(1_200_00n);
    expect(result.netCash).toBe(900_00n);
  });

  it("reports a loss rather than clamping at zero", () => {
    // An order that cost more to service than it earned is exactly the thing
    // worth seeing, so the net goes negative instead of flooring.
    const result = summarise([project()], [], [expense({ amount: 3_000_00n })]);
    expect(result.netEarned).toBe(-1_000_00n);
  });

  it("counts general overheads with no order behind them", () => {
    const result = summarise(
      [project()],
      [],
      [expense({ id: "e2", projectId: null, orderId: null, description: "Trade fair stand" })],
    );
    expect(result.expenses).toBe(500_00n);
  });

  it("treats no expenses as zero, not as missing", () => {
    const result = summarise([project()], []);
    expect(result.expenses).toBe(0n);
    expect(result.netEarned).toBe(result.commission);
  });
});

describe("passbook", () => {
  const payment = receipt;

  const spend = (id: string, amount: bigint, incurredOn: Date): FinanceExpense => ({
    id,
    amount,
    incurredOn,
    description: "Samples",
    category: "SAMPLES",
    notes: null,
    projectId: null,
    orderId: null,
    orderExists: false,
    clientId: null,
    clientName: null,
  });

  it("interleaves money in and money out, oldest first", () => {
    const rows = passbook(
      [payment("a", 1_000_00n, utc("2026-03-01")), payment("b", 500_00n, utc("2026-03-20"))],
      [spend("c", 200_00n, utc("2026-03-10"))],
    );

    expect(rows.map((row) => row.direction)).toEqual(["IN", "OUT", "IN"]);
  });

  it("runs a balance that adds what came in and subtracts what went out", () => {
    const rows = passbook(
      [payment("a", 1_000_00n, utc("2026-03-01"))],
      [spend("c", 200_00n, utc("2026-03-10"))],
    );
    expect(rows.map((row) => row.balance)).toEqual([1_000_00n, 800_00n]);
  });

  it("lets the balance go negative when the spending ran ahead of the cash", () => {
    const rows = passbook([], [spend("c", 200_00n, utc("2026-03-10"))]);
    expect(rows[0].balance).toBe(-200_00n);
  });

  it("keeps amounts positive and carries the sign in the direction", () => {
    const rows = passbook([], [spend("c", 200_00n, utc("2026-03-10"))]);
    expect(rows[0].amount).toBe(200_00n);
    expect(rows[0].direction).toBe("OUT");
  });

  it("orders same-day entries stably, so the running balance does not shuffle", () => {
    const sameDay = utc("2026-03-10");
    const first = passbook([payment("a", 100_00n, sameDay)], [spend("b", 50_00n, sameDay)]);
    const second = passbook([payment("a", 100_00n, sameDay)], [spend("b", 50_00n, sameDay)]);
    expect(first.map((row) => row.id)).toEqual(second.map((row) => row.id));
  });

  it("never collides a payment id with an expense id", () => {
    // Both tables generate their own cuids, so the same string can appear in
    // each; the passbook must still produce two distinct rows.
    const rows = passbook([payment("same", 100_00n, utc("2026-03-01"))], [
      spend("same", 50_00n, utc("2026-03-02")),
    ]);
    expect(new Set(rows.map((row) => row.id)).size).toBe(2);
  });
});

describe("retainer fees in the ledger", () => {
  it("counts charges apart from commission received", () => {
    const result = summarise(
      [project()],
      [receipt("a", 1_000_00n, utc("2026-04-01"))],
      [],
      [retainerFee("c1", 500_00n, utc("2026-03-05"))],
    );

    expect(result.commissionReceived).toBe(1_000_00n);
    expect(result.retainerReceived).toBe(500_00n);
    expect(result.moneyIn).toBe(1_500_00n);
  });

  it("counts retainer fees received toward net earned", () => {
    // ₹2,000 commission earned + ₹500 retainer received = ₹2,500.
    const result = summarise([project()], [], [], [retainerFee("c1", 500_00n, utc("2026-03-05"))]);
    expect(result.netEarned).toBe(2_500_00n);
  });

  it("never counts a retainer as commission earned", () => {
    // Commission is what the orders earned; a retainer is a separate fee, and
    // folding it in would overstate the commission rate.
    const result = summarise([project()], [], [], [retainerFee("c1", 500_00n, utc("2026-03-05"))]);
    expect(result.commission).toBe(2_000_00n);
  });

  it("puts each fee in the passbook as money in, with no order", () => {
    const rows = passbook([], [], [
      retainerFee("c1", 500_00n, utc("2026-03-05")),
      retainerFee("c2", 500_00n, utc("2026-04-05")),
    ]);

    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.direction === "IN" && row.kind === "RETAINER")).toBe(true);
    expect(rows[0].orderId).toBeNull();
    expect(rows[0].description).toBe("Retainer — Meridian Foods");
    // Each month adds to the balance in turn.
    expect(rows.map((row) => row.balance)).toEqual([500_00n, 1_000_00n]);
  });

  it("shows nothing until a fee is actually logged", () => {
    // Nothing is assumed: a retainer only reaches the ledger when recorded.
    const rows = passbook([], [], []);
    expect(rows).toHaveLength(0);
    expect(summarise([project()], [], [], []).retainerReceived).toBe(0n);
  });

  it("interleaves fees with commission and expenses by date", () => {
    const rows = passbook(
      [receipt("a", 1_000_00n, utc("2026-03-01"))],
      [],
      [retainerFee("c1", 500_00n, utc("2026-02-01"))],
    );
    expect(rows.map((row) => row.kind)).toEqual(["RETAINER", "COMMISSION"]);
  });

  it("names the client a commission receipt came from, via its order", () => {
    const rows = passbook([receipt("a", 100_00n, utc("2026-03-01"))], []);
    expect(rows[0].description).toBe("Commission from Meridian Foods");
  });

  it("does not crash on a receipt whose client cannot be resolved", () => {
    const rows = passbook([receipt("a", 100_00n, utc("2026-03-01"), { clientName: null })], []);
    expect(rows[0].description).toBe("Commission from a client");
  });
});

describe("expensesByCategory", () => {
  const spend = (id: string, amount: bigint, category: string | null): FinanceExpense => ({
    id,
    amount,
    incurredOn: utc("2026-03-10"),
    description: "Something",
    category,
    notes: null,
    projectId: null,
    orderId: null,
    orderExists: false,
    clientId: null,
    clientName: null,
  });

  it("groups by category, biggest first", () => {
    const rows = expensesByCategory([
      spend("a", 100_00n, "TRAVEL"),
      spend("b", 500_00n, "SAMPLES"),
      spend("c", 200_00n, "TRAVEL"),
    ]);

    expect(rows.map((row) => row.key)).toEqual(["SAMPLES", "TRAVEL"]);
    expect(rows[0].amount).toBe(500_00n);
    expect(rows[1].amount).toBe(300_00n);
    expect(rows[1].count).toBe(2);
  });

  it("keeps uncategorised spends rather than dropping them", () => {
    // Money left out of a breakdown is money the breakdown lies about.
    const rows = expensesByCategory([spend("a", 100_00n, null), spend("b", 50_00n, "TRAVEL")]);
    expect(rows.find((row) => row.key === "")?.amount).toBe(100_00n);
  });

  it("is empty rather than undefined when nothing was spent", () => {
    expect(expensesByCategory([])).toEqual([]);
  });
});

describe("expenses attributed to a client", () => {
  it("names who a spend was for when there is no order behind it", () => {
    const rows = passbook(
      [],
      [
        {
          id: "e1",
          amount: 300_00n,
          incurredOn: utc("2026-03-10"),
          description: "Samples posted",
          category: "SAMPLES",
          notes: null,
          projectId: null,
          orderId: null,
          orderExists: false,
          clientId: "c9",
          clientName: "Al Noor Trading",
        },
      ],
    );
    expect(rows[0].description).toBe("Samples posted — Al Noor Trading");
  });
});

describe("receivedOn", () => {
  it("reports the cash received, uncapped by what was owed", () => {
    // An overpaid order: the client sent ₹7,000 against ₹2,000 of commission.
    // Reporting the capped balance here understated the cash by ₹5,000.
    const overpaid = project({ payments: [{ amount: 7_000_00n, paidOn: utc("2026-03-15") }] });
    expect(commissionOf(overpaid)).toBe(2_000_00n);
    expect(receivedOn(overpaid)).toBe(7_000_00n);
    expect(outstandingOf(overpaid)).toBe(0n);
  });

  it("is zero for an order nobody has paid", () => {
    expect(receivedOn(project())).toBe(0n);
  });

  it("adds up part payments", () => {
    const partly = project({
      payments: [
        { amount: 500_00n, paidOn: utc("2026-03-15") },
        { amount: 300_00n, paidOn: utc("2026-04-15") },
      ],
    });
    expect(receivedOn(partly)).toBe(800_00n);
  });
});
