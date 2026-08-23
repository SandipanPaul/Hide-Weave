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
test.describe("finances", () => {
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
    await page.goto("/finances?currency=INR");

    // The part payment appears in the passbook as money in, against its order.
    const passbook = page.getByRole("table").filter({ hasText: "Balance" });
    const entry = passbook.getByRole("row").filter({ hasText: orderId });
    await expect(entry).toContainText("₹20,000.00");
    await expect(entry).toContainText(client);

    // Delivered and part-paid, so it is a receivable for what is still owed.
    const receivables = page.getByRole("row").filter({ hasText: orderId });
    await expect(receivables).toContainText("₹30,000.00");
    await expect(receivables).toContainText("₹20,000.00");

    // And the sampling is on the 30-day list.
    const samplings = page.getByRole("table").filter({ hasText: "Date" }).last();
    await expect(samplings.getByRole("row").filter({ hasText: client })).toBeVisible();
  });

  test("never presents order value as income", async ({ page }) => {
    await page.goto("/finances");

    // The two headline figures are labelled so they cannot be confused, and
    // order value is explicitly disclaimed.
    await expect(page.getByText("Commission earned", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Goods moved through you — not income")).toBeVisible();
    await expect(page.getByText("Commission earned less expenses")).toBeVisible();
  });

  test("respects the date range, down to an empty one", async ({ page }) => {
    await page.goto("/finances");
    // Default is the last 12 months, so the reset control is not offered.
    await expect(page.getByRole("button", { name: "Last 12 months" })).toHaveCount(0);

    // A window before any data exists: every figure falls to zero rather than
    // the page erroring or silently showing everything.
    await page.goto("/finances?from=2000-01-01&to=2000-12-31&currency=INR");
    const cards = page.locator("main");
    await expect(cards.getByText("₹0.00").first()).toBeVisible();
    await expect(page.getByText("Nothing in this range").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Last 12 months" })).toBeVisible();
  });

  /** Both exports live behind one menu, so each is opened by name. */
  async function exportCsv(
    page: import("@playwright/test").Page,
    testInfo: import("@playwright/test").TestInfo,
    item: "Ledger" | "Orders",
  ) {
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export CSV" }).click();
    await page.getByRole("menuitem", { name: new RegExp(item) }).click();
    const download = await downloadPromise;

    const saved = testInfo.outputPath(`${item}.csv`);
    await download.saveAs(saved);
    const raw = await import("node:fs/promises").then((fs) => fs.readFile(saved, "utf8"));
    // The file carries a UTF-8 BOM so Excel opens it without mangling accents.
    expect(raw.startsWith("\ufeff")).toBe(true);
    return { filename: download.suggestedFilename(), csv: raw.replace(/^\ufeff/, "") };
  }

  test("exports the orders behind the figures", async ({ page }, testInfo) => {
    await page.goto("/finances?currency=INR");
    const { filename, csv } = await exportCsv(page, testInfo, "Orders");

    expect(filename).toMatch(/^finances-INR-\d{4}-\d{2}-\d{2}-to-/);
    expect(csv.split("\r\n")[0]).toBe(
      "Order ID,Client,Product,Status,Order date,Expected delivery,Actual delivery,Currency,Order value,Commission %,Commission,Received,Outstanding,Expenses,Net",
    );
    expect(csv.split("\r\n").length).toBeGreaterThan(1);
  });

  test("exports a ledger that reconciles with the passbook", async ({ page }, testInfo) => {
    await page.goto("/finances?currency=INR");
    const { filename, csv } = await exportCsv(page, testInfo, "Ledger");

    expect(filename).toMatch(/^ledger-INR-\d{4}-\d{2}-\d{2}-to-/);
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe("Date,Type,Detail,Client,Order ID,Category,Currency,In,Out,Balance");

    // The file has one row per passbook row, and its last balance is the
    // closing balance the page prints underneath the table.
    const passbookRows = await page
      .getByRole("table")
      .filter({ hasText: "Balance" })
      .getByRole("row")
      .count();
    expect(lines.length - 1).toBe(passbookRows - 1); // less the header row

    const lastBalance = lines[lines.length - 1].split(",").pop();
    const closing = await page.getByText(/Closing balance/).locator("xpath=..").textContent();
    expect(closing?.replace(/[^\d.]/g, "")).toContain(lastBalance?.replace(/[^\d.]/g, ""));
  });
});
