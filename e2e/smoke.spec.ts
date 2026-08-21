import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

const PASSWORD = process.env.APP_PASSWORD ?? "changeme";

/**
 * Milestone 1 smoke test: the app is gated, and the right password gets in.
 * The full add client -> sampling -> project -> payment -> dashboard journey
 * lands here in the final milestone.
 */
test("signing in directly at /login works without a redirect target", async ({ page }) => {
  // Regression: with no ?next= param the hidden field is absent, so the server
  // action receives null for it. That must not fail validation.
  await page.goto("/login");
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Unlock" }).click();

  // With no redirect target, sign-in lands on the default tab.
  await expect(page).toHaveURL(/\/projects/);
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
});

test("password gate blocks the app and lets the right password through", async ({ page }) => {
  await page.goto("/clients");
  await expect(page).toHaveURL(/\/login/);

  await page.getByLabel("Password").fill("definitely-wrong");
  await page.getByRole("button", { name: "Unlock" }).click();
  // Scoped by id: Next renders its own role="alert" route announcer.
  await expect(page.locator("#password-error")).toContainText("not correct");

  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Unlock" }).click();

  await expect(page).toHaveURL(/\/clients/);
  await expect(page.getByRole("heading", { name: "Clients" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
});

test("theme choice applies immediately and survives navigation", async ({ page }) => {
  await signIn(page);

  await page.getByRole("button", { name: "Change theme" }).click();
  await page.getByRole("menuitem", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);

  // The choice is remembered, not just applied to the page that set it.
  await page.goto("/clients");
  await expect(page.locator("html")).toHaveClass(/dark/);

  await page.getByRole("button", { name: "Change theme" }).click();
  await page.getByRole("menuitem", { name: "Light" }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);

  // And "System" is offered, which is the default.
  await page.getByRole("button", { name: "Change theme" }).click();
  await expect(page.getByRole("menuitem", { name: "System" })).toBeVisible();
});
