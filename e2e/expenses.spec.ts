import { expect, test } from "@playwright/test";
import { addClientNamed, signIn, uniqueName, orderIdForClient } from "./helpers";
import { cleanupE2ERows } from "./db-cleanup";

/**
 * Expenses: money out, on an order and off it.
 *
 * The invariant these guard is the one that is easiest to get wrong — an
 * expense reduces what the agent *earned*, and never what a client *owes*.
 */
test.describe("expenses", () => {
  test.beforeEach(async ({ page }) => {
    cleanupE2ERows();
    await signIn(page);
  });

  const today = () => new Date().toISOString().slice(0, 10);

  async function addProject(page: import("@playwright/test").Page, client: string) {
    await page.goto("/projects");
    await page.getByRole("button", { name: "Add project" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Client").click();
    await page.getByRole("option", { name: client }).click();
    await dialog.getByLabel("Product").fill("Leather satchels");
    await dialog.getByLabel(/^Quantity/).fill("100");
    await dialog.getByLabel("Order value").fill("1000000");
    await dialog.getByLabel("Commission %").fill("5");
    await dialog.getByLabel("Order date").fill(today());
    await dialog.getByRole("button", { name: "Add project" }).click();
    await dialog.waitFor({ state: "hidden" });
    return orderIdForClient(page, client);
  }

  test("an expense on an order cuts the net, not what the client owes", async ({ page }) => {
    const client = await addClientNamed(page, uniqueName("E2E Expense Client"));
    const orderId = await addProject(page, client);

    await page.getByLabel("Search projects").fill(orderId);
    await page.getByRole("link", { name: orderId }).click();

    // ₹10,00,000 at 5% earns ₹50,000, and nothing is paid yet.
    await expect(page.getByText("₹50,000.00").first()).toBeVisible();

    await page.getByRole("button", { name: "Add expense" }).click();
    await page.getByLabel("What it was for").fill("Courier to Chennai");
    await page.getByLabel(/^Amount/).fill("2000");
    await page.getByRole("button", { name: "Record expense" }).click();

    // Net is ₹48,000 — but the client is still owed ₹50,000 of commission.
    await expect(page.getByText("₹48,000.00").first()).toBeVisible();
    await expect(page.getByText(/Less ₹2,000\.00 of expenses/)).toBeVisible();
    const outstanding = page.locator("dd").filter({ hasText: "₹50,000.00" });
    await expect(outstanding.first()).toBeVisible();
  });

  test("an expense can be corrected and deleted, and the net follows", async ({ page }) => {
    const client = await addClientNamed(page, uniqueName("E2E Expense Edit"));
    const orderId = await addProject(page, client);

    await page.getByLabel("Search projects").fill(orderId);
    await page.getByRole("link", { name: orderId }).click();

    await page.getByRole("button", { name: "Add expense" }).click();
    await page.getByLabel("What it was for").fill("Sample freight");
    await page.getByLabel(/^Amount/).fill("1000");
    await page.getByRole("button", { name: "Record expense" }).click();
    await expect(page.getByRole("cell", { name: "Sample freight" })).toBeVisible();

    await page.getByRole("button", { name: /^Edit expense/ }).click();
    await page.getByLabel(/^Amount/).fill("4000");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("₹46,000.00").first()).toBeVisible();

    await page.getByRole("button", { name: /^Delete expense/ }).click();
    await page.getByRole("button", { name: "Delete expense" }).last().click();
    // With nothing spent, the summary drops the "less expenses" line entirely.
    await expect(page.getByText(/of expenses/)).toHaveCount(0);
  });

  test("a general expense with no order behind it lands in the passbook", async ({ page }) => {
    await page.goto("/finances?currency=INR");

    // The button is in the page header, not inside the passbook.
    await page.getByRole("button", { name: "Add expense" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("What it was for").fill("E2E trade fair stand");
    await dialog.getByLabel(/^Amount/).fill("7500");
    await dialog.getByLabel("Category").click();
    await page.getByRole("option", { name: "Office & admin" }).click();
    await dialog.getByRole("button", { name: "Record expense" }).click();
    await dialog.waitFor({ state: "hidden" });

    const row = page.getByRole("row").filter({ hasText: "E2E trade fair stand" });
    await expect(row).toContainText("₹7,500.00");
    await expect(row).toContainText("Office & admin");
    // No order to link to, so the Order cell is an em dash rather than a link.
    await expect(row.getByRole("link")).toHaveCount(0);
  });

  test("rejects an expense with no amount and no description", async ({ page }) => {
    await page.goto("/finances?currency=INR");

    await page.getByRole("button", { name: "Add expense" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Record expense" }).click();

    await expect(dialog.getByText("Say what this was for.")).toBeVisible();
    await expect(dialog.getByText("Amount is required.")).toBeVisible();
  });
});

/**
 * Retainers: a rate on the client, logged by hand each time a fee arrives.
 */
test.describe("retainers", () => {
  test.beforeEach(async ({ page }) => {
    cleanupE2ERows();
    await signIn(page);
  });

  /** Opens a client with a monthly retainer rate already set. */
  async function clientWithRate(page: import("@playwright/test").Page, rate: string) {
    const name = uniqueName("E2E Retainer Client");
    await addClientNamed(page, name);
    await page.getByLabel("Search clients").fill(name);
    await page.getByRole("link", { name }).click();
    await page.getByRole("button", { name: "Edit" }).first().click();
    await page.getByLabel(/Monthly retainer/i).fill(rate);
    await page.getByRole("button", { name: /Save/ }).click();
    return name;
  }

  test("logging a paid retainer puts it in the passbook", async ({ page }) => {
    const client = await clientWithRate(page, "10000");

    await expect(page.getByText("No retainer fees logged")).toBeVisible();
    await page.getByRole("button", { name: "Retainer fees paid" }).click();
    await expect(page.getByText("Total received")).toBeVisible();

    await page.goto("/finances?currency=INR");
    const row = page.getByRole("row").filter({ hasText: `Retainer — ${client}` });
    await expect(row.first()).toContainText("₹10,000.00");
  });

  test("a logged fee can be removed again", async ({ page }) => {
    await clientWithRate(page, "10000");
    await page.getByRole("button", { name: "Retainer fees paid" }).click();
    await expect(page.getByText("Total received")).toBeVisible();

    await page.getByRole("button", { name: /^Delete retainer fee/ }).click();
    await page.getByRole("button", { name: "Delete fee" }).last().click();
    await expect(page.getByText("No retainer fees logged")).toBeVisible();
  });

  test("a fee cannot be logged without a monthly amount", async ({ page }) => {
    const name = uniqueName("E2E No Rate Client");
    await addClientNamed(page, name);
    await page.getByLabel("Search clients").fill(name);
    await page.getByRole("link", { name }).click();

    // Nothing to charge, so the control is unavailable rather than failing late.
    await expect(page.getByRole("button", { name: "Retainer fees paid" })).toBeDisabled();
  });

  test("an expense can name the client it was for, with no order", async ({ page }) => {
    const client = await addClientNamed(page, uniqueName("E2E Sample Client"));

    await page.goto("/finances?currency=INR");
    await page.getByRole("button", { name: "Add expense" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("What it was for").fill("E2E samples posted");
    await dialog.getByLabel(/^Amount/).fill("1200");
    await dialog.getByLabel("Client").click();
    await page.getByRole("option", { name: client }).click();
    await dialog.getByRole("button", { name: "Record expense" }).click();
    await dialog.waitFor({ state: "hidden" });

    const row = page.getByRole("row").filter({ hasText: "E2E samples posted" });
    await expect(row).toContainText(client);
    await expect(row).toContainText("₹1,200.00");
  });
});
