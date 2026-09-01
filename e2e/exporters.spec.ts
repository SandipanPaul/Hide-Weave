import { expect, test } from "@playwright/test";
import { signInAtSuppliers, uniqueName } from "./helpers";
import { cleanupE2ERows } from "./db-cleanup";

/**
 * Milestone 5, part A: supplier CRUD against the real database.
 *
 * Rows created here are named "E2E …" and removed in teardown.
 */
test.describe("suppliers", () => {
  test.beforeEach(async ({ page }) => {
    cleanupE2ERows();
    await signInAtSuppliers(page);
  });

  /**
   * Matches a label from its start.
   *
   * Exact matching would miss "Company name (required)", and loose matching
   * would make "Website" ambiguous with "Fill from a website".
   */
  function field(
    scope: import("@playwright/test").Locator | import("@playwright/test").Page,
    label: string,
  ) {
    return scope.getByLabel(new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  }

  async function addSupplier(page: import("@playwright/test").Page, fields: Record<string, string>) {
    await page.goto("/suppliers");
    await page.getByRole("button", { name: "Add supplier" }).click();
    const dialog = page.getByRole("dialog");
    for (const [label, value] of Object.entries(fields)) {
      await field(dialog, label).fill(value);
    }
    await dialog.getByRole("button", { name: "Add supplier" }).click();
    await dialog.waitFor({ state: "hidden" });
  }

  test("adds an supplier, accepting a bare domain as its website", async ({ page }) => {
    const name = uniqueName("E2E Leather Co");
    await addSupplier(page, {
      "Company name": name,
      Website: "asianleather.example.com",
      "Contact person": "R. Iyer",
      Email: "sales@asianleather.example.com",
      Phone: "+91 44 2345 6789",
    });

    // The table shows the bare domain — scheme and www are noise.
    const row = page.getByRole("row").filter({ hasText: name });
    await expect(row).toContainText("asianleather.example.com");

    await page.getByRole("link", { name }).click();
    // Stored canonically, with the scheme it was missing.
    await expect(
      page.getByRole("link", { name: "asianleather.example.com", exact: true }),
    ).toHaveAttribute("href", "https://asianleather.example.com");
  });

  test("treats the same site written differently as one supplier", async ({ page }) => {
    const first = uniqueName("E2E Klasse");
    await addSupplier(page, { "Company name": first, Website: "https://klasseleather.example.com" });

    await page.goto("/suppliers");
    await page.getByRole("button", { name: "Add supplier" }).click();
    const dialog = page.getByRole("dialog");
    await field(dialog, "Company name").fill(uniqueName("E2E Klasse Other"));
    // Same site: www, http, and a trailing slash are not a different supplier.
    await field(dialog, "Website").fill("http://www.klasseleather.example.com/");
    await dialog.getByRole("button", { name: "Add supplier" }).click();

    await expect(dialog.getByText(/already uses this website/)).toBeVisible();
  });

  test("refuses a second supplier with the same name", async ({ page }) => {
    const name = uniqueName("E2E Trio Group");
    await addSupplier(page, { "Company name": name });

    await page.goto("/suppliers");
    await page.getByRole("button", { name: "Add supplier" }).click();
    const dialog = page.getByRole("dialog");
    await field(dialog, "Company name").fill(name.toLowerCase());
    await dialog.getByRole("button", { name: "Add supplier" }).click();

    await expect(dialog.getByText("An supplier with this name already exists.")).toBeVisible();
  });

  test("edits an supplier in place", async ({ page }) => {
    const name = uniqueName("E2E Dugros");
    await addSupplier(page, { "Company name": name });

    await page.getByLabel("Search suppliers").fill(name);
    await expect(page.getByText(/of 1 suppliers/)).toBeVisible();
    await page.getByRole("link", { name }).click();

    await page.getByRole("button", { name: "Edit" }).click();
    await field(page, "Contact person").fill("Meera Nair");
    await field(page, "Phone").fill("+91 98400 11111");
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(page.getByRole("link", { name: "Meera Nair" })).toHaveCount(0);
    await expect(page.getByText("Meera Nair")).toBeVisible();
    await expect(page.getByRole("link", { name: "+91 98400 11111" })).toBeVisible();
  });

  // Extraction itself is tested against saved pages in the unit suite. What
  // matters here is the wiring and the refusals, both of which are offline and
  // therefore deterministic — an e2e test must not depend on a third-party
  // site being up.
  test("refuses to fetch an address on this machine", async ({ page }) => {
    await page.goto("/suppliers");
    await page.getByRole("button", { name: "Add supplier" }).click();
    const dialog = page.getByRole("dialog");

    await dialog.getByLabel("Fill from a website").fill("http://localhost:5432");
    await dialog.getByRole("button", { name: "Read site" }).click();

    await expect(dialog.getByRole("alert")).toContainText(/private network|this machine/i);
    // The form is untouched: a refused read fills nothing in.
    await expect(field(dialog, "Company name")).toHaveValue("");
  });

  test("refuses an address that is not a website", async ({ page }) => {
    await page.goto("/suppliers");
    await page.getByRole("button", { name: "Add supplier" }).click();
    const dialog = page.getByRole("dialog");

    await dialog.getByLabel("Fill from a website").fill("nonsense");
    await dialog.getByRole("button", { name: "Read site" }).click();

    await expect(dialog.getByRole("alert")).toContainText(/Enter a web address/i);
    await expect(field(dialog, "Company name")).toHaveValue("");
  });

  test("rejects a website that is not a web address", async ({ page }) => {
    await page.goto("/suppliers");
    await page.getByRole("button", { name: "Add supplier" }).click();
    const dialog = page.getByRole("dialog");
    await field(dialog, "Company name").fill(uniqueName("E2E Bad Site"));
    await field(dialog, "Website").fill("not a website");

    await expect(dialog.getByText(/Enter a web address/)).toBeVisible();
  });
});
