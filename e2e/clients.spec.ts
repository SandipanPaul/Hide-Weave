import { expect, test } from "@playwright/test";
import { signInAtClients, uniqueName } from "./helpers";

/**
 * Milestone 2: adding a client, editing it in place, and managing its
 * samplings — all against the real database.
 *
 * Rows created here are named "E2E …" and removed in global teardown.
 */
test.describe("clients", () => {
  test.beforeEach(async ({ page }) => {
    await signInAtClients(page);
  });

  test("adds a client, enforcing the phone-or-email rule at form level", async ({ page }) => {
    const name = uniqueName();

    await page.getByRole("button", { name: "Add client" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog.getByLabel("Name").fill(name);

    // Merely moving through the fields must stay quiet — nothing has been
    // filled in wrongly yet.
    await dialog.getByLabel("Phone", { exact: true }).click();
    await dialog.getByLabel("Email", { exact: true }).click();
    await expect(dialog.getByRole("alert")).toHaveCount(0);

    // Engaging with the pair and leaving both empty does raise it: a client
    // with neither a phone nor an email would be unreachable.
    await dialog.getByLabel("Phone", { exact: true }).fill("1");
    await dialog.getByLabel("Phone", { exact: true }).fill("");
    await expect(dialog.getByRole("alert")).toContainText("at least one way to reach");

    // The error belongs to the form, not to either field individually.
    // Unique per run: a reused address would trip the duplicate-email guard.
    await dialog.getByLabel("Email", { exact: true }).fill(
      `${name.replace(/\s+/g, "-").toLowerCase()}@example.com`,
    );
    await expect(dialog.getByRole("alert")).toHaveCount(0);

    await dialog.getByRole("button", { name: "Add client" }).click();

    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole("link", { name })).toBeVisible();
  });

  test("rejects a duplicate name, case-insensitively", async ({ page }) => {
    const name = uniqueName();

    for (const attempt of [name, name.toUpperCase()]) {
      await page.getByRole("button", { name: "Add client" }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel("Name").fill(attempt);
      await dialog.getByLabel("Phone", { exact: true }).fill("+91 99999 00000");
      await dialog.getByRole("button", { name: "Add client" }).click();

      if (attempt === name) {
        await expect(dialog).not.toBeVisible();
      } else {
        // Second attempt differs only by case, so it must be refused.
        await expect(dialog.getByText("already exists")).toBeVisible();
        await dialog.getByRole("button", { name: "Cancel" }).click();
      }
    }
  });

  test("adds, completes and deletes a sampling without leaving the page", async ({ page }) => {
    const name = uniqueName();

    await page.getByRole("button", { name: "Add client" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill(name);
    await dialog.getByLabel("Phone", { exact: true }).fill("+91 98765 43210");
    await dialog.getByRole("button", { name: "Add client" }).click();
    await expect(dialog).not.toBeVisible();

    await page.getByRole("link", { name }).click();
    await expect(page.getByRole("heading", { name })).toBeVisible();

    const url = page.url();

    await page.getByRole("button", { name: "Add sampling" }).click();
    await page.getByLabel("Date").fill("2027-03-15");
    await page.getByLabel("Product").fill("Orthodox tea");
    await page.getByRole("button", { name: "Add sampling" }).click();

    const sampling = page.getByRole("listitem").filter({ hasText: "Orthodox tea" });
    await expect(sampling).toBeVisible();
    await expect(sampling.getByText("Scheduled")).toBeVisible();
    // Everything happens inline — the URL never changes.
    expect(page.url()).toBe(url);

    await sampling.getByRole("button", { name: /Mark sampling .* complete/ }).click();

    // Completing it makes it history even though the date is still in the
    // future, so it leaves the upcoming list and hides behind the toggle.
    await expect(page.getByRole("listitem").filter({ hasText: "Orthodox tea" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Show past samplings/ })).toBeVisible();

    await page.getByRole("button", { name: /Show past samplings/ }).click();
    const pastSampling = page.getByRole("listitem").filter({ hasText: "Orthodox tea" });
    await expect(pastSampling.getByText("Completed")).toBeVisible();
    await pastSampling.getByRole("button", { name: /Delete sampling/ }).click();

    const confirm = page.getByRole("alertdialog");
    await expect(confirm).toContainText("Delete this sampling?");
    await confirm.getByRole("button", { name: "Delete" }).click();

    await expect(page.getByRole("listitem").filter({ hasText: "Orthodox tea" })).toHaveCount(0);
  });

  test("edits client details in place", async ({ page }) => {
    const name = uniqueName();

    await page.getByRole("button", { name: "Add client" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill(name);
    await dialog.getByLabel("Phone", { exact: true }).fill("+91 90000 00000");
    await dialog.getByRole("button", { name: "Add client" }).click();
    await expect(dialog).not.toBeVisible();

    await page.getByRole("link", { name }).click();
    await page.getByRole("button", { name: "Edit" }).click();

    await page.getByLabel("Contact person").fill("Priya Nair");
    await page.getByLabel("Monthly retainer").fill("2500.50");
    await page.getByRole("button", { name: "Save changes" }).click();

    // Exact: the contact name also appears in the page subheading.
    await expect(page.getByText("Priya Nair", { exact: true })).toBeVisible();
    // Stored as minor units and rendered back with the currency's grouping.
    await expect(page.getByText("/ month")).toContainText("2,500.50");
  });

  test("searching narrows the list and reports when nothing matches", async ({ page }) => {
    await page.getByLabel("Search clients").fill("Konkan");
    await expect(page.getByRole("link", { name: "Konkan Marine Exports" })).toBeVisible();
    await expect(page.getByText(/of 1 clients/)).toBeVisible();

    await page.getByLabel("Search clients").fill("nothing matches this");
    await expect(page.getByText(/No clients match/)).toBeVisible();
  });

  test("changes a client's status without opening the edit form", async ({ page }) => {
    const name = uniqueName("E2E Status Client");
    await page.getByRole("button", { name: "Add client" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill(name);
    await dialog.getByLabel(/Email/).first().fill("status@example.com");
    await dialog.getByRole("button", { name: "Add client" }).click();
    await dialog.waitFor({ state: "hidden" });

    await page.getByLabel("Search clients").fill(name);
    await page.getByRole("link", { name }).click();

    // Two clicks, and no edit form in between.
    await page.getByRole("button", { name: /^Status: Active/ }).click();
    await page.getByRole("menuitem", { name: "Chasing" }).click();

    await expect(page.getByRole("button", { name: /^Status: Chasing/ })).toBeVisible();
    // It really persisted, not just re-rendered optimistically.
    await page.reload();
    await expect(page.getByRole("button", { name: /^Status: Chasing/ })).toBeVisible();

    // And the list agrees.
    await page.goto("/clients");
    await page.getByLabel("Search clients").fill(name);
    await expect(page.getByRole("row").filter({ hasText: name })).toContainText("Chasing");
  });

  test("the status control names where things stand, for a screen reader", async ({ page }) => {
    await page.getByLabel("Search clients").fill("Konkan");
    await page.getByRole("link", { name: "Konkan Marine Exports" }).click();

    // A bare badge reads as decoration; this says what it is and what it does.
    const trigger = page.getByRole("button", { name: /^Status: \w+\. Change it\.$/ });
    await expect(trigger).toBeVisible();

    // The current status is marked, so the menu shows where you are.
    await trigger.click();
    await expect(page.getByRole("menuitem", { name: "Active" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });
});
