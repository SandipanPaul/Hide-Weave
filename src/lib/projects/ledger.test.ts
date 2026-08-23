import { describe, expect, it } from "vitest";
import { projectLedger, runningBalances } from "./ledger";

/** ₹50,00,000 at 2% = ₹1,00,000 commission. Values are in paise. */
const project = { orderValue: 500_000_000n, commissionPercentage: 2 };

describe("projectLedger", () => {
  it("settles the commission, not the order value", () => {
    const ledger = projectLedger(project, []);
    expect(ledger.commission).toBe(10_000_000n);
    expect(ledger.outstanding).toBe(10_000_000n);
    // The order value is 50x the commission and must never be what is owed.
    expect(ledger.outstanding).not.toBe(project.orderValue);
  });

  it("adds up part payments", () => {
    const ledger = projectLedger(project, [{ amount: 4_000_000n }, { amount: 2_500_000n }]);
    expect(ledger.paid).toBe(6_500_000n);
    expect(ledger.outstanding).toBe(3_500_000n);
    expect(ledger.settled).toBe(false);
  });

  it("is settled when the payments exactly meet the commission", () => {
    const ledger = projectLedger(project, [{ amount: 10_000_000n }]);
    expect(ledger.outstanding).toBe(0n);
    expect(ledger.overpaid).toBe(0n);
    expect(ledger.settled).toBe(true);
    expect(ledger.percentPaid).toBe(100);
  });

  it("reports an overpayment separately rather than as a negative balance", () => {
    const ledger = projectLedger(project, [{ amount: 10_500_000n }]);
    expect(ledger.outstanding).toBe(0n);
    expect(ledger.overpaid).toBe(500_000n);
    expect(ledger.settled).toBe(true);
  });

  it("uses the rounded commission, so a paid-in-full project reads as settled", () => {
    // 3.3% of 29,99,999,999.99 rounds up; paying the rounded figure must settle
    // it exactly rather than leaving a phantom paisa outstanding.
    const odd = { orderValue: 2_999_999_999_999n, commissionPercentage: 3.3 };
    const commission = projectLedger(odd, []).commission;
    expect(commission).toBe(99_000_000_000n);
    expect(projectLedger(odd, [{ amount: commission }]).outstanding).toBe(0n);
  });

  it("treats a zero-commission project as settled without dividing by zero", () => {
    const free = { orderValue: 500_000_000n, commissionPercentage: 0 };
    expect(projectLedger(free, []).percentPaid).toBe(0);
    expect(projectLedger(free, []).settled).toBe(true);
    // Money received against nothing owed is an overpayment, not 0% progress.
    expect(projectLedger(free, [{ amount: 100n }]).overpaid).toBe(100n);
    expect(projectLedger(free, [{ amount: 100n }]).percentPaid).toBe(100);
  });
});

describe("runningBalances", () => {
  it("shows what was still owed after each payment", () => {
    expect(runningBalances(10_000_000n, [{ amount: 4_000_000n }, { amount: 6_000_000n }])).toEqual([
      6_000_000n,
      0n,
    ]);
  });

  it("goes negative on an overpayment, because that is what the ledger did", () => {
    expect(runningBalances(1_000n, [{ amount: 1_500n }])).toEqual([-500n]);
  });
});

describe("expenses on a project", () => {
  it("deducts expenses from commission without changing what is outstanding", () => {
    // ₹1,00,000 at 2% earns ₹2,000; ₹500 of courier leaves ₹1,500 net. The
    // client still owes the full ₹2,000 — the agent's costs are not theirs.
    const ledger = projectLedger({ orderValue: 100_000_00n, commissionPercentage: 2 }, [], [
      { amount: 500_00n },
    ]);

    expect(ledger.commission).toBe(2_000_00n);
    expect(ledger.expenses).toBe(500_00n);
    expect(ledger.net).toBe(1_500_00n);
    expect(ledger.outstanding).toBe(2_000_00n);
  });

  it("reports a loss when an order cost more to service than it earned", () => {
    const ledger = projectLedger({ orderValue: 100_000_00n, commissionPercentage: 2 }, [], [
      { amount: 3_000_00n },
    ]);
    expect(ledger.net).toBe(-1_000_00n);
  });

  it("leaves settled untouched — expenses are not payments", () => {
    const ledger = projectLedger(
      { orderValue: 100_000_00n, commissionPercentage: 2 },
      [{ amount: 2_000_00n }],
      [{ amount: 500_00n }],
    );
    expect(ledger.settled).toBe(true);
    expect(ledger.net).toBe(1_500_00n);
  });

  it("treats no expenses as zero, not as missing", () => {
    const ledger = projectLedger({ orderValue: 100_000_00n, commissionPercentage: 2 }, []);
    expect(ledger.expenses).toBe(0n);
    expect(ledger.net).toBe(ledger.commission);
  });
});
