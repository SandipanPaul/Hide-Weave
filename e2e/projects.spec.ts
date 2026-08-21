import path from "node:path";
import { expect, test } from "@playwright/test";
import { addClientNamed, signInAtProjects, uniqueName, uniqueOrderId } from "./helpers";
import { cleanupE2ERows } from "./db-cleanup";

/**
 * Milestone 4: recording an order, checking the commission it earns, and
 * settling it with part payments — all against the real database.
 *
 * Rows created here are named "E2E …" or "E2E-…" and removed in teardown.
 */
test.describe("projects", () => {
  test.beforeEach(async ({ page }) => {
    // These tests count rows and totals, so they must not inherit anything a
    // previous test left behind.
    cleanupE2ERows();
    await signInAtProjects(page);
  });

  /** ₹25,00,000 at 2.5% = ₹62,500. Chosen so the arithmetic is checkable by eye. */
  const ORDER_VALUE = "2500000";
  const COMMISSION = "62,500";

  async function addProject(page: import("@playwright/test").Page, client: string) {
    const orderId = uniqueOrderId();

    await page.goto("/projects");
    await page.getByRole("button", { name: "Add project" }).click();
    const dialog = page.getByRole("dialog");

    await dialog.getByLabel("Client").click();
    await page.getByRole("option", { name: client }).click();

    await dialog.getByLabel("Product").fill("Basmati rice");
    await dialog.getByLabel("Order ID").fill(orderId);
    await dialog.getByLabel("Quantity").fill("1000");
    await dialog.getByLabel("Order value").fill(ORDER_VALUE);
    await dialog.getByLabel("Commission %").fill("2.5");
    await dialog.getByLabel("Order date").fill("2026-08-01");

    // The whole point of the live preview: the figure is checkable before saving.
    await expect(dialog.getByTestId("commission-preview")).toContainText(COMMISSION);

    await dialog.getByRole("button", { name: "Add project" }).click();
    await dialog.waitFor({ state: "hidden" });
    return orderId;
  }

  /**
   * Searches for one order and opens it.
   *
   * The wait matters: the search box navigates on a debounce, and clicking a
   * row link before that lands lets the debounced navigation cancel it.
   */
  async function openProject(page: import("@playwright/test").Page, orderId: string) {
    await page.goto("/projects");
    await page.getByLabel("Search projects").fill(orderId);
    await expect(page.getByText(/of 1 projects/)).toBeVisible();
    await page.getByRole("link", { name: orderId }).click();
    await expect(page.getByRole("heading", { name: orderId })).toBeVisible();
  }

  test("computes commission live, saves it, and settles it with part payments", async ({
    page,
  }) => {
    const client = await addClientNamed(page, uniqueName("E2E Project Client"));
    const orderId = await addProject(page, client);

    // The list shows the computed commission, not a stored one.
    await page.goto("/projects");
    await page.getByLabel("Search projects").fill(orderId);
    await expect(page.getByText(/of 1 projects/)).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: orderId })).toContainText(COMMISSION);

    await page.getByRole("link", { name: orderId }).click();
    await expect(page.getByRole("heading", { name: orderId })).toBeVisible();

    // Commission is the headline; the order value is context, never income.
    await expect(page.getByText("Commission earned")).toBeVisible();
    await expect(page.getByText(`₹${COMMISSION}.00`).first()).toBeVisible();
    await expect(page.getByText("2.5% of ₹25,00,000.00 routed")).toBeVisible();

    // A part payment leaves the rest outstanding.
    await page.getByRole("button", { name: "Record payment" }).click();
    await page.getByLabel(/^Amount/).fill("20000");
    await page.getByLabel("Paid on").fill("2026-08-10");
    await page.getByRole("button", { name: "Record payment" }).click();

    await expect(page.getByRole("cell", { name: "₹42,500.00" })).toBeVisible();
    await expect(page.getByText("Outstanding")).toBeVisible();

    // Paying the remainder settles it exactly — no phantom balance.
    await page.getByRole("button", { name: "Record payment" }).click();
    await page.getByLabel("Paid on").fill("2026-08-20");
    await page.getByRole("button", { name: "Record payment" }).click();

    await expect(page.getByText("This project's commission is fully settled.")).toBeVisible();
    await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  });

  test("corrects a mistyped payment without deleting it", async ({ page }) => {
    const client = await addClientNamed(page, uniqueName("E2E Payment Client"));
    const orderId = await addProject(page, client);
    await openProject(page, orderId);

    // A typo: ₹2,000 entered where ₹20,000 was meant.
    await page.getByRole("button", { name: "Record payment" }).click();
    await page.getByLabel(/^Amount/).fill("2000");
    await page.getByRole("button", { name: "Record payment" }).click();
    await expect(page.getByRole("cell", { name: "₹60,500.00" })).toBeVisible();

    await page.getByRole("button", { name: /^Edit payment of/ }).click();
    await page.getByLabel(/^Amount/).fill("20000");
    await page.getByRole("button", { name: "Save changes" }).click();

    // The balance follows the correction, and there is still one payment.
    await expect(page.getByRole("cell", { name: "₹42,500.00" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Edit payment of/ })).toHaveCount(1);
  });

  test("refuses a second project with the same order ID", async ({ page }) => {
    const client = await addClientNamed(page, uniqueName("E2E Dup Client"));
    const orderId = await addProject(page, client);

    await page.goto("/projects");
    await page.getByRole("button", { name: "Add project" }).click();
    const dialog = page.getByRole("dialog");

    await dialog.getByLabel("Client").click();
    await page.getByRole("option", { name: client }).click();
    await dialog.getByLabel("Product").fill("Basmati rice");
    await dialog.getByLabel("Order ID").fill(orderId);
    await dialog.getByLabel("Quantity").fill("10");
    await dialog.getByLabel("Order value").fill("1000");
    await dialog.getByLabel("Commission %").fill("1");
    await dialog.getByRole("button", { name: "Add project" }).click();

    await expect(dialog.getByText("Another project already uses this order ID.")).toBeVisible();
  });

  test("filters by client and totals only what the filter matches", async ({ page }) => {
    const client = await addClientNamed(page, uniqueName("E2E Filter Client"));
    await addProject(page, client);

    await page.goto("/projects");
    await page.getByLabel("Client").click();
    await page.getByRole("option", { name: client }).click();

    // One project, so the footer total is that project's own commission.
    await expect(page.getByText(/of 1 projects/)).toBeVisible();
    const footer = page.locator("tfoot");
    await expect(footer).toContainText("25,00,000");
    await expect(footer).toContainText(COMMISSION);

    // The filter survives sorting, rather than quietly widening the list.
    await page.getByRole("link", { name: /Order value/ }).click();
    await expect(page).toHaveURL(/clientId=/);
    await expect(page.getByText(/of 1 projects/)).toBeVisible();
  });

  test("imports a CSV, resolving client names and refusing unknown ones", async ({ page }) => {
    // A fixed name, not a unique one: the file has to name the client, and
    // cleanup runs before every test so there is nothing left to collide with.
    const client = await addClientNamed(page, "E2E Project Import Client");

    await page.goto("/projects");
    await page.getByRole("button", { name: "Import CSV" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#csv-file").setInputFiles(path.join(__dirname, "fixtures", "projects.csv"));

    // Order-sheet vocabulary is recognised without being told.
    await expect(dialog.getByLabel("Map column PO No.")).toContainText("Order ID");
    await expect(dialog.getByLabel("Map column Buyer's Name")).toContainText("Client");
    await expect(dialog.getByLabel("Map column Comm %")).toContainText("Commission %");

    await dialog.getByRole("button", { name: /Preview 4 rows/ }).click();

    // A client that isn't on file is named, not reported as "required".
    await expect(dialog.getByText(/No client called .Nobody Trading Ltd./)).toBeVisible();
    // The repeated order ID is caught against the earlier row in the same file.
    await expect(dialog.getByLabel("What to do with duplicate row 4")).toBeVisible();

    await dialog.getByRole("button", { name: /Import 2 projects/ }).click();
    await expect(dialog.getByText(/Imported 2 new projects/)).toBeVisible();
    await dialog.getByRole("button", { name: "Done" }).click();

    // Commission is computed on import, never taken from the file.
    await page.getByLabel("Client").click();
    await page.getByRole("option", { name: client }).click();
    await expect(page.getByText(/of 2 projects/)).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: "E2E-IMP-001" })).toContainText("62,500");
    await expect(page.getByRole("row").filter({ hasText: "E2E-IMP-002" })).toContainText("12,000");
    // Two currencies are never mixed; here both are INR, so one total line.
    await expect(page.locator("tfoot")).toContainText("74,500");
  });

  test("keeps a cancelled order out of the totals", async ({ page }) => {
    const client = await addClientNamed(page, uniqueName("E2E Cancelled Client"));
    const orderId = await addProject(page, client);

    await openProject(page, orderId);

    await page.getByRole("button", { name: "Edit" }).click();
    await page.getByLabel("Status").click();
    await page.getByRole("option", { name: "Cancelled" }).click();
    await page.getByRole("button", { name: "Save changes" }).click();

    await page.goto("/projects");
    await page.getByLabel("Client").click();
    await page.getByRole("option", { name: client }).click();

    // The row is still listed — it happened — but it routed no goods and
    // earned nothing, so it contributes nothing to the totals.
    await expect(page.getByRole("row").filter({ hasText: orderId })).toBeVisible();
    await expect(page.locator("tfoot")).toHaveCount(0);
  });
});
