import { expect, test } from "@playwright/test";
import { addClientNamed, signIn, uniqueName, uniqueOrderId } from "./helpers";
import { cleanupE2ERows } from "./db-cleanup";

/**
 * Milestone 6: the dashboard, and the whole chain that feeds it.
 *
 * Figures are asserted per row rather than as page totals: the dashboard also
 * shows the seeded dataset, so "this client earned exactly ₹50,000" is
 * checkable while "the page totals X" would not be.
 */
test.describe("economics", () => {
  test.beforeEach(async ({ page }) => {
    cleanupE2ERows();
    await signIn(page);
  });

  const dayOffset = (days: number) => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  };

  test("add client → sampling → project → payment → see it on the dashboard", async ({
    page,
  }) => {
    const client = await addClientNamed(page, uniqueName("E2E Dashboard Client"));
    const orderId = uniqueOrderId();
    const today = dayOffset(0);

    // A sampling inside the 30-day window the dashboard reports on. Samplings
    // are added on the client's own page, so open it first.
    await page.getByLabel("Search clients").fill(client);
    await expect(page.getByText(/of 1 clients/)).toBeVisible();
    await page.getByRole("link", { name: client }).click();
    await page.getByRole("button", { name: "Add sampling" }).click();
    await page.getByLabel("Date").fill(dayOffset(7));
    await page.getByLabel("Product").fill("Frozen prawns");
    await page.getByRole("button", { name: "Add sampling" }).click();
    await expect(page.getByText("Frozen prawns")).toBeVisible();

    // ₹10,00,000 at 5% earns ₹50,000. Delivered, so the commission is owed.
    await page.goto("/projects");
    await page.getByRole("button", { name: "Add project" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Client").click();
    await page.getByRole("option", { name: client }).click();
    await dialog.getByLabel("Product").fill("Frozen prawns");
    await dialog.getByLabel("Order ID").fill(orderId);
    await dialog.getByLabel(/^Quantity/).fill("500");
    await dialog.getByLabel("Order value").fill("1000000");
    await dialog.getByLabel("Commission %").fill("5");
    await dialog.getByLabel("Status").click();
    await page.getByRole("option", { name: "Delivered", exact: true }).click();
    await dialog.getByLabel("Order date").fill(today);
    await dialog.getByLabel("Actual delivery").fill(today);
    await expect(dialog.getByTestId("commission-preview")).toContainText("50,000");
    await dialog.getByRole("button", { name: "Add project" }).click();
    await dialog.waitFor({ state: "hidden" });

    // A part payment, leaving ₹30,000 owed.
    await page.getByLabel("Search projects").fill(orderId);
    await expect(page.getByText(/of 1 projects/)).toBeVisible();
    await page.getByRole("link", { name: orderId }).click();
    await page.getByRole("button", { name: "Record payment" }).click();
    await page.getByLabel(/^Amount/).fill("20000");
    await page.getByRole("button", { name: "Record payment" }).click();
    await expect(page.getByRole("cell", { name: "₹30,000.00" })).toBeVisible();

    // The dashboard, in the currency this order was billed in.
    await page.goto("/economics?currency=INR");

    const topClients = page.getByRole("table").filter({ hasText: "Avg %" });
    const row = topClients.getByRole("row").filter({ hasText: client });
    await expect(row).toContainText("₹50,000.00");
    await expect(row).toContainText("5.00%");

    // Delivered and part-paid, so it is a receivable for what is still owed.
    const receivables = page.getByRole("row").filter({ hasText: orderId });
    await expect(receivables).toContainText("₹30,000.00");
    await expect(receivables).toContainText("₹20,000.00");

    // And the sampling is on the 30-day list.
    const samplings = page.getByRole("table").filter({ hasText: "Date" }).last();
    await expect(samplings.getByRole("row").filter({ hasText: client })).toBeVisible();
  });

  test("never presents order value as income", async ({ page }) => {
    await page.goto("/economics");

    // The two headline figures are labelled so they cannot be confused, and
    // order value is explicitly disclaimed.
    await expect(page.getByText("Commission earned", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Goods moved through you — not income")).toBeVisible();
    await expect(page.getByText(/Separate scales/)).toBeVisible();
  });

  test("respects the date range, down to an empty one", async ({ page }) => {
    await page.goto("/economics");
    // Default is the last 12 months, so the reset control is not offered.
    await expect(page.getByRole("button", { name: "Last 12 months" })).toHaveCount(0);

    // A window before any data exists: every figure falls to zero rather than
    // the page erroring or silently showing everything.
    await page.goto("/economics?from=2000-01-01&to=2000-12-31&currency=INR");
    const cards = page.locator("main");
    await expect(cards.getByText("₹0.00").first()).toBeVisible();
    await expect(page.getByText("Nothing in this range").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Last 12 months" })).toBeVisible();
  });

  test("exports the rows the figures were derived from", async ({ page }, testInfo) => {
    await page.goto("/economics?currency=INR");

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export CSV" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^economics-INR-\d{4}-\d{2}-\d{2}-to-/);

    const saved = testInfo.outputPath("economics.csv");
    await download.saveAs(saved);
    // The file carries a UTF-8 BOM so Excel opens it without mangling accents.
    const raw = await import("node:fs/promises").then((fs) => fs.readFile(saved, "utf8"));
    expect(raw.startsWith("\ufeff")).toBe(true);
    const csv = raw.replace(/^\ufeff/, "");

    // The orders behind the totals, not the totals themselves.
    expect(csv.split("\r\n")[0]).toBe(
      "Order ID,Client,Product,Status,Order date,Expected delivery,Actual delivery,Currency,Order value,Commission %,Commission,Received,Outstanding",
    );
    expect(csv.split("\r\n").length).toBeGreaterThan(1);
  });
});
