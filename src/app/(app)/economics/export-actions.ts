"use server";

import { commissionOf, outstandingOf } from "@/lib/economics/aggregate";
import { getEconomics, parseEconomicsRange, getCurrencyOptions } from "@/lib/economics/queries";
import { rowsToCsv } from "@/lib/csv/mapping";
import { utcToDateOnly } from "@/lib/dates";
import { minorToMajorString } from "@/lib/money";
import { PROJECT_STATUS_LABELS, type ProjectStatus } from "@/lib/enums";

/**
 * The rows every figure on the dashboard was derived from.
 *
 * Deliberately the underlying orders rather than the summarised cards: a
 * total you cannot check is worth less than the rows behind it. Money is
 * written in major units without grouping, so a spreadsheet reads it as a
 * number rather than as text.
 */
export async function exportEconomicsCsv(
  searchParams: Record<string, string>,
): Promise<{ filename: string; csv: string }> {
  const currencies = await getCurrencyOptions();
  const range = parseEconomicsRange(searchParams, currencies);
  const { projects } = await getEconomics(range);

  const headers = [
    "Order ID",
    "Client",
    "Product",
    "Status",
    "Order date",
    "Expected delivery",
    "Actual delivery",
    "Currency",
    "Order value",
    "Commission %",
    "Commission",
    "Received",
    "Outstanding",
  ];

  const rows = projects
    .slice()
    .sort((a, b) => a.orderDate.getTime() - b.orderDate.getTime())
    .map((project) => {
      const commission = commissionOf(project);
      const outstanding = outstandingOf(project);
      const paid = commission - outstanding;

      return {
        "Order ID": project.orderId,
        Client: project.clientName,
        Product: project.product,
        Status: PROJECT_STATUS_LABELS[project.status as ProjectStatus] ?? project.status,
        "Order date": utcToDateOnly(project.orderDate),
        "Expected delivery": project.expectedDelivery
          ? utcToDateOnly(project.expectedDelivery)
          : "",
        "Actual delivery": project.actualDelivery ? utcToDateOnly(project.actualDelivery) : "",
        Currency: range.currency,
        "Order value": minorToMajorString(project.orderValue, range.currency),
        "Commission %": String(project.commissionPercentage),
        Commission: minorToMajorString(commission, range.currency),
        // What has actually been received against this order, capped at the
        // commission owed — an overpayment is not extra earnings.
        Received: minorToMajorString(paid > 0n ? paid : 0n, range.currency),
        Outstanding: minorToMajorString(outstanding, range.currency),
      };
    });

  const from = utcToDateOnly(range.from);
  const to = utcToDateOnly(range.to);

  return {
    filename: `economics-${range.currency}-${from}-to-${to}.csv`,
    csv: rowsToCsv(headers, rows),
  };
}
