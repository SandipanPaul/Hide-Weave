import { computeCommission, percentOf, sumMinor } from "@/lib/money";

/**
 * What a project owes and what has been received against it.
 *
 * The balance settles the *commission*, not the order value. The order value
 * is the consignment total — goods routed through the agent, never money owed
 * to them — so a project worth ₹50,00,000 at 2% is settled by ₹1,00,000, not
 * by ₹50,00,000.
 *
 * Every figure comes from `computeCommission`, so a project's ledger can never
 * disagree with the commission shown next to it in a table.
 */

export type ProjectLedger = {
  /** Commission earned on this order — the amount the payments settle. */
  commission: bigint;
  /** Sum of payments received. */
  paid: bigint;
  /** Still owed. Zero once settled; never negative — see `overpaid`. */
  outstanding: bigint;
  /** Received beyond the commission owed. Usually zero. */
  overpaid: bigint;
  settled: boolean;
  /** For a progress bar only. Never feed this back into money maths. */
  percentPaid: number;
};

export function projectLedger(
  project: { orderValue: bigint; commissionPercentage: number },
  payments: ReadonlyArray<{ amount: bigint }>,
): ProjectLedger {
  const commission = computeCommission(project.orderValue, project.commissionPercentage);
  const paid = sumMinor(payments.map((payment) => payment.amount));
  const difference = commission - paid;

  return {
    commission,
    paid,
    // Split rather than signed: "outstanding: -500" reads as a debt of minus
    // five hundred, which is not what an overpayment is.
    outstanding: difference > 0n ? difference : 0n,
    overpaid: difference < 0n ? -difference : 0n,
    settled: difference <= 0n,
    percentPaid: commission === 0n ? (paid > 0n ? 100 : 0) : percentOf(paid, commission),
  };
}

/** Running balance down a ledger, oldest first — what was still owed after each payment. */
export function runningBalances(
  commission: bigint,
  payments: ReadonlyArray<{ amount: bigint }>,
): bigint[] {
  let remaining = commission;
  return payments.map((payment) => {
    remaining -= payment.amount;
    return remaining;
  });
}
