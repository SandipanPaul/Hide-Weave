import { describe, expect, it } from "vitest";
import {
  cashByMonth,
  commissionByClient,
  commissionByProduct,
  lateDeliveries,
  monthlyRetainer,
  monthlyTotals,
  monthsBetween,
  outstandingOf,
  overdueReceivables,
  summarise,
  topClients,
  type EconomicsProject,
} from "./aggregate";
import type { ProjectStatus } from "@/lib/enums";

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** Amounts are minor units: 1_00_000_00n is ₹1,00,000.00. */
function project(overrides: Partial<EconomicsProject> = {}): EconomicsProject {
  return {
    id: "p1",
    clientId: "c1",
    clientName: "Meridian Foods",
    product: "Basmati rice",
    orderId: "ORD-1",
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
      { amount: 1_500_00n, paidOn: utc("2026-05-02") },
      { amount: 500_00n, paidOn: utc("2026-06-11") },
    ];
    expect(summarise([project()], payments).cashReceived).toBe(2_000_00n);
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
      cashReceived: 0n,
      outstanding: 0n,
      atRisk: 0n,
      activeProjects: 0,
    });
  });
});

describe("monthlyRetainer", () => {
  it("adds up what active clients are billed each month", () => {
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
});

describe("monthly series", () => {
  it("includes months with nothing in them", () => {
    // A gap must read as a quiet month, not as a missing one.
    const points = monthlyTotals([project()], utc("2026-02-01"), utc("2026-04-30"));
    expect(points.map((p) => p.month)).toEqual(["2026-02", "2026-03", "2026-04"]);
    expect(points[0]).toMatchObject({ orderValue: 0n, commission: 0n });
    expect(points[1]).toMatchObject({ orderValue: 100_000_00n, commission: 2_000_00n });
  });

  it("buckets orders by order date and cash by payment date", () => {
    const paid = project({
      orderDate: utc("2026-03-10"),
      payments: [{ amount: 2_000_00n, paidOn: utc("2026-05-20") }],
    });
    const from = utc("2026-03-01");
    const to = utc("2026-05-31");

    expect(monthlyTotals([paid], from, to).find((p) => p.month === "2026-03")?.commission).toBe(
      2_000_00n,
    );
    // The cash lands in May, the month it arrived.
    const cash = cashByMonth(paid.payments, from, to);
    expect(cash.find((p) => p.month === "2026-05")?.amount).toBe(2_000_00n);
    expect(cash.find((p) => p.month === "2026-03")?.amount).toBe(0n);
  });

  it("ignores anything outside the range rather than folding it into an edge month", () => {
    const old = project({ orderDate: utc("2025-01-01") });
    const points = monthlyTotals([old], utc("2026-01-01"), utc("2026-02-28"));
    expect(points.every((point) => point.orderValue === 0n)).toBe(true);
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

describe("rankings", () => {
  const projects = [
    project({ id: "a", clientId: "c1", clientName: "Meridian", product: "Rice", orderValue: 100_000_00n }),
    project({ id: "b", clientId: "c1", clientName: "Meridian", product: "rice ", orderValue: 200_000_00n }),
    project({ id: "c", clientId: "c2", clientName: "Al Noor", product: "Cardamom", orderValue: 50_000_00n }),
    project({ id: "d", clientId: "c3", clientName: "Cancelled Co", status: "CANCELLED", orderValue: 900_000_00n }),
  ];

  it("groups by client, biggest commission first, ignoring cancelled orders", () => {
    const ranked = commissionByClient(projects);
    expect(ranked.map((row) => row.label)).toEqual(["Meridian", "Al Noor"]);
    expect(ranked[0].commission).toBe(6_000_00n);
  });

  it("groups products written with different casing and spacing as one", () => {
    const ranked = commissionByProduct(projects);
    expect(ranked.map((row) => row.label)).toEqual(["Rice", "Cardamom"]);
    expect(ranked[0].commission).toBe(6_000_00n);
  });

  it("caps the list at the limit asked for", () => {
    expect(commissionByClient(projects, 1)).toHaveLength(1);
  });

  it("reports each client's weighted average percentage and order count", () => {
    const rows = topClients([
      project({ id: "a", clientId: "c1", orderValue: 1_000_000_00n, commissionPercentage: 2 }),
      project({ id: "b", clientId: "c1", orderValue: 1_000_00n, commissionPercentage: 10 }),
    ]);
    expect(rows[0].orders).toBe(2);
    expect(rows[0].averagePercentage).toBeCloseTo(2.008, 2);
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
