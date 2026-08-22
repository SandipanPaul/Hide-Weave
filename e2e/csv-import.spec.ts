import path from "node:path";
import { expect, test } from "@playwright/test";
import { cleanupE2ERows } from "./db-cleanup";
import { signInAtClients } from "./helpers";

/**
 * Milestone 3: the CSV import, exercised end to end with a deliberately messy
 * file — bad email, missing name, unreachable row, malformed date, a duplicate
 * inside the file, and a duplicate of a seeded client.
 */
test.describe("csv import", () => {
  const fixture = path.join(__dirname, "fixtures", "clients-messy.csv");

  test.beforeEach(async ({ page }) => {
    // These tests share one fixture file, so rows imported by an earlier test
    // would show up as duplicates in a later one and shift every count.
    // Each test starts from the seeded data and nothing else.
    cleanupE2ERows();
    await signInAtClients(page);
  });

  test("maps, previews, dedupes and imports transactionally", async ({ page }) => {
    await page.getByRole("button", { name: "Import CSV" }).click();
    const dialog = page.getByRole("dialog");

    await dialog.locator("#csv-file").setInputFiles(fixture);

    // Headers are guessed from aliases, and unknown columns are left alone.
    await expect(dialog.getByLabel("Map column Company")).toContainText("Name");
    await expect(dialog.getByLabel("Map column E-mail")).toContainText("Email");
    await expect(dialog.getByLabel("Map column Mobile")).toContainText("Phone");
    await expect(dialog.getByLabel("Map column Attn")).toContainText("Contact person");
    await expect(dialog.getByLabel("Map column Internal Ref")).toContainText("Ignore this column");

    await dialog.getByRole("button", { name: /Preview 8 rows/ }).click();

    // The whole summary line, not the bold count inside it.
    const summary = dialog.locator('p[aria-live="polite"]');

    // Row 3 has a bad email, row 4 has no name, row 5 has a malformed date,
    // row 6 has neither phone nor email — four errors in all.
    await expect(summary).toContainText("4 have errors");

    // Two duplicates: row 7 repeats row 1, row 8 matches a seeded client.
    await expect(dialog.getByLabel("What to do with duplicate row 7")).toBeVisible();
    await expect(dialog.getByLabel("What to do with duplicate row 8")).toBeVisible();
    await expect(summary).toContainText("2 skipped as duplicates");

    await dialog.getByRole("button", { name: /Import 2 clients/ }).click();

    await expect(dialog.getByText(/Imported 2 new clients/)).toBeVisible();
    await expect(dialog.getByText("1 sampling scheduled")).toBeVisible();
    await expect(dialog.getByText(/4 rows could not be imported/)).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Download failed rows" })).toBeVisible();

    await dialog.getByRole("button", { name: "Done" }).click();

    // Only the two clean rows landed.
    await page.getByLabel("Search clients").fill("E2E Import");
    await expect(page.getByRole("link", { name: "E2E Import Alpha" })).toBeVisible();
    await expect(page.getByRole("link", { name: "E2E Import Beta" })).toBeVisible();
    await expect(page.getByRole("link", { name: "E2E Import Gamma" })).toHaveCount(0);
    await expect(page.getByText(/of 2 clients/)).toBeVisible();
  });

  test("updates an existing client instead of duplicating it", async ({ page }) => {
    const fileA = path.join(__dirname, "fixtures", "clients-update-a.csv");
    const fileB = path.join(__dirname, "fixtures", "clients-update-b.csv");

    // First import creates the client.
    await page.getByRole("button", { name: "Import CSV" }).click();
    let dialog = page.getByRole("dialog");
    await dialog.locator("#csv-file").setInputFiles(fileA);
    await dialog.getByRole("button", { name: /Preview 1 rows/ }).click();
    await dialog.getByRole("button", { name: /Import 1 clients/ }).click();
    await expect(dialog.getByText(/Imported 1 new clients/)).toBeVisible();
    await dialog.getByRole("button", { name: "Done" }).click();

    // Second import collides on name. Default is skip, so nothing changes
    // until the decision is switched to update.
    await page.getByRole("button", { name: "Import CSV" }).click();
    dialog = page.getByRole("dialog");
    await dialog.locator("#csv-file").setInputFiles(fileB);
    await dialog.getByRole("button", { name: /Preview 1 rows/ }).click();

    const summary = dialog.locator('p[aria-live="polite"]');
    await expect(summary).toContainText("1 skipped as duplicates");

    await dialog.getByLabel("What to do with duplicate row 1").click();
    await page.getByRole("option", { name: "Update existing" }).click();
    await expect(summary).toContainText("1 will import");

    await dialog.getByRole("button", { name: /Import 1 clients/ }).click();
    await expect(dialog.getByText(/updated 1/)).toBeVisible();
    await dialog.getByRole("button", { name: "Done" }).click();

    // One client, carrying the second file's details.
    await page.getByLabel("Search clients").fill("E2E Update Target");
    await expect(page.getByText(/of 1 clients/)).toBeVisible();
    await page.getByRole("link", { name: "E2E Update Target" }).click();
    await expect(page.getByText("Meena Iyer", { exact: true })).toBeVisible();
    await expect(page.getByText("+91 90000 88888")).toBeVisible();
  });

  test("fixes broken rows inline and imports them", async ({ page }) => {
    await page.getByRole("button", { name: "Import CSV" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#csv-file").setInputFiles(fixture);
    await dialog.getByRole("button", { name: /Preview 8 rows/ }).click();

    const summary = dialog.locator('p[aria-live="polite"]');
    await expect(summary).toContainText("4 have errors");

    // Narrow to just the rows that need work.
    await dialog.getByRole("button", { name: /Show only rows needing attention/ }).click();

    // Row 3: a malformed email.
    await dialog.getByRole("button", { name: "Edit row 3" }).click();
    await expect(dialog.locator("#row-3-email-error")).toContainText("valid email");
    await dialog.locator("#row-3-email").fill("gamma@example.com");
    await expect(dialog.getByText("This row is ready to import.")).toBeVisible();
    await dialog.getByRole("button", { name: "Finish editing row 3" }).click();

    // Row 5: a date written the wrong way round.
    await dialog.getByRole("button", { name: "Edit row 5" }).click();
    await dialog.locator("#row-5-samplingDate").fill("2027-12-31");
    await dialog.getByRole("button", { name: "Finish editing row 5" }).click();

    // Row 4: no name at all.
    await dialog.getByRole("button", { name: "Edit row 4" }).click();
    await dialog.locator("#row-4-name").fill("E2E Import Fixed");
    await dialog.getByRole("button", { name: "Finish editing row 4" }).click();

    // Three of the four errors are resolved, so three more rows can import.
    await expect(summary).toContainText("5 will import");
    await expect(summary).toContainText("1 has errors");

    await dialog.getByRole("button", { name: /Import 5 clients/ }).click();
    await expect(dialog.getByText(/Imported 5 new clients/)).toBeVisible();
    await dialog.getByRole("button", { name: "Done" }).click();

    // The corrected values are what landed.
    await page.getByLabel("Search clients").fill("E2E Import Fixed");
    await expect(page.getByText(/of 1 clients/)).toBeVisible();
    await page.getByRole("link", { name: "E2E Import Fixed" }).click();
    await expect(page.getByText("nameless@example.com")).toBeVisible();
  });

  test("undoes an inline correction on request", async ({ page }) => {
    await page.getByRole("button", { name: "Import CSV" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#csv-file").setInputFiles(fixture);
    await dialog.getByRole("button", { name: /Preview 8 rows/ }).click();

    await dialog.getByRole("button", { name: "Edit row 3" }).click();
    await dialog.locator("#row-3-email").fill("gamma@example.com");
    await expect(dialog.getByText("This row is ready to import.")).toBeVisible();

    await dialog.getByRole("button", { name: "Undo my changes" }).click();
    await expect(dialog.locator("#row-3-email")).toHaveValue("not-an-email");
    await expect(dialog.locator("#row-3-email-error")).toContainText("valid email");
  });

  // The fixture keeps the shape of a real spreadsheet — obfuscated "(at)",
  // several values per cell, a cross-row repeat — but every address is on
  // example.com. Real ones would collide with whatever is in the database.
  test("imports several phones and emails from one cell", async ({ page }) => {
    await page.getByRole("button", { name: "Import CSV" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#csv-file").setInputFiles(
      path.join(__dirname, "fixtures", "clients-multi-contact.csv"),
    );

    // Headers from a real spreadsheet are recognised by their aliases.
    await expect(dialog.getByLabel("Map column BUYER'S NAME")).toContainText("Name");
    await expect(dialog.getByLabel("Map column EMAIL ID.")).toContainText("Email");
    await expect(dialog.getByLabel("Map column CONTACT NO.")).toContainText("Phone");

    await dialog.getByRole("button", { name: /Preview 4 rows/ }).click();

    // Row 4 shares an address with row 2, so it is caught as a duplicate even
    // though row 2 carries that address as its second email.
    await expect(dialog.getByLabel("What to do with duplicate row 4")).toBeVisible();

    await dialog.getByRole("button", { name: /Import 3 clients/ }).click();
    await expect(dialog.getByText(/Imported 3 new clients/)).toBeVisible();
    await dialog.getByRole("button", { name: "Done" }).click();

    // "(at)" was read as "@".
    await page.getByLabel("Search clients").fill("info@e2e-weku.example.com");
    await expect(page.getByRole("link", { name: "E2E WEKU GmbH" })).toBeVisible();

    // Four addresses and two numbers landed on one client, all searchable.
    await page.getByLabel("Search clients").fill("puspanjali@e2e-april.example.com");
    await expect(page.getByText(/of 1 clients/)).toBeVisible();
    await page.getByRole("link", { name: "E2E APRIL SOURCING" }).click();
    for (const email of [
      "ruchi@e2e-april.example.com",
      "pallavi@e2e-april.example.com",
      "puspanjali@e2e-april.example.com",
      "jyoti@e2e-april.example.com",
    ]) {
      await expect(page.getByRole("link", { name: email })).toBeVisible();
    }
    await expect(page.getByRole("link", { name: "+91 90000 11111" })).toBeVisible();
    await expect(page.getByRole("link", { name: "022-2345 6789" })).toBeVisible();
  });

  test("adds and removes contact rows in the client form", async ({ page }) => {
    await page.getByRole("button", { name: "Add client" }).click();
    const dialog = page.getByRole("dialog");

    await dialog.getByLabel("Name").fill("E2E Multi Contact");
    // Adding a blank row must not raise the "how do I reach them" error.
    await dialog.getByRole("button", { name: "Add another address" }).click();
    await expect(dialog.getByRole("alert")).toHaveCount(0);
    await dialog.getByLabel("Email", { exact: true }).fill("first@example.com");
    await dialog.getByLabel("Email 2", { exact: true }).fill("second@example.com");
    await dialog.getByRole("button", { name: "Add another number" }).click();
    await dialog.getByLabel("Phone", { exact: true }).fill("+91 90000 22222");

    await dialog.getByRole("button", { name: "Add client" }).click();
    await expect(dialog).not.toBeVisible();

    await page.getByLabel("Search clients").fill("E2E Multi Contact");
    // The list shows the primary address and a count of the rest.
    await expect(page.getByText(/of 1 clients/)).toBeVisible();
    await expect(page.getByRole("cell", { name: /first@example.com/ })).toContainText("+1");

    await page.getByRole("link", { name: "E2E Multi Contact" }).click();
    await expect(page.getByRole("link", { name: "second@example.com" })).toBeVisible();
  });

  test("imports countries written as names, codes and aliases", async ({ page }) => {
    await page.getByRole("button", { name: "Import CSV" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#csv-file").setInputFiles(
      path.join(__dirname, "fixtures", "clients-countries.csv"),
    );

    await expect(dialog.getByLabel("Map column Country")).toContainText("Country");
    await dialog.getByRole("button", { name: /Preview 5 rows/ }).click();

    // Four resolve; "Atlantis" is refused rather than stored as typed.
    const summary = dialog.locator('p[aria-live="polite"]');
    await expect(summary).toContainText("4 will import");
    await expect(summary).toContainText("1 has errors");
    await expect(dialog.getByText(/not a country we recognise/)).toBeVisible();

    await dialog.getByRole("button", { name: /Import 4 clients/ }).click();
    await expect(dialog.getByText(/Imported 4 new clients/)).toBeVisible();
    await dialog.getByRole("button", { name: "Done" }).click();

    // Every spelling landed as a canonical country name in the list.
    await page.getByLabel("Search clients").fill("E2E Country");
    const table = page.getByRole("table");
    await expect(table).toContainText("India");
    await expect(table).toContainText("United States");
    await expect(table).toContainText("United Kingdom");
    await expect(table).toContainText("Singapore");
  });

  test("finds clients by country name even though a code is stored", async ({ page }) => {
    // "JP" is what is stored; "Japan" is what a person types. The search has
    // to resolve the name to the code before it reaches the database.
    await page.getByLabel("Search clients").fill("Japan");
    await expect(page.getByRole("link", { name: "Sakura Import Co" })).toBeVisible();

    // And it must actually narrow: a client filed under another country is
    // gone. Asserting a total count instead would break the moment the
    // database holds a second Japanese client, which says nothing about the
    // behaviour being tested.
    await expect(page.getByRole("link", { name: "Meridian Foods Ltd" })).toHaveCount(0);
  });

  test("offers a template whose own headers map cleanly", async ({ page }, testInfo) => {
    await page.getByRole("button", { name: "Import CSV" }).click();
    const dialog = page.getByRole("dialog");

    // Arm the listener before the click, rather than racing it: whichever
    // settles first would otherwise decide the result.
    const downloadPromise = page.waitForEvent("download");
    await dialog.getByRole("button", { name: "Download template CSV" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("clients-template.csv");

    // The point of the template is that re-uploading it maps cleanly, so the
    // file itself has to be checked, not just its name.
    const saved = testInfo.outputPath("clients-template.csv");
    await download.saveAs(saved);
    await dialog.locator("#csv-file").setInputFiles(saved);

    await expect(dialog.getByLabel("Map column Name")).toContainText("Name");
    await expect(dialog.getByLabel("Map column Email")).toContainText("Email");
    await expect(dialog.getByLabel("Map column Monthly retainer")).toContainText(
      "Monthly retainer",
    );
    await expect(dialog.getByLabel("Map column Sampling date")).toContainText("Sampling date");
    // Its one example row is valid. It is flagged as a duplicate — the example
    // client shares a name with one in the seed — so the check is that nothing
    // is in *error*, which is what a re-uploadable template has to guarantee.
    await dialog.getByRole("button", { name: /Preview 1 rows/ }).click();
    await expect(dialog.locator('p[aria-live="polite"]')).not.toContainText("error");
  });

  test("refuses a file with no data rows", async ({ page }, testInfo) => {
    const emptyFile = testInfo.outputPath("headers-only.csv");
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(emptyFile, "Name,Email,Phone\n"),
    );

    await page.getByRole("button", { name: "Import CSV" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#csv-file").setInputFiles(emptyFile);

    await expect(dialog.getByRole("alert")).toContainText("no rows of data");
  });
});
