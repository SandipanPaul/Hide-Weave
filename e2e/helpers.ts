import { expect, type Page } from "@playwright/test";

export const PASSWORD = process.env.APP_PASSWORD ?? "changeme";

/** Signs in through the password gate and lands on the default tab. */
export async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Unlock" }).click();
  await page.waitForURL(/\/projects/);
}

/** Signs in and navigates to the Clients tab. */
export async function signInAtClients(page: Page) {
  await signIn(page);
  await page.goto("/clients");
}

/** A name unique to this run, so repeated runs never collide on uniqueness. */
export function uniqueName(prefix = "E2E Client") {
  return `${prefix} ${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
}

/** Signs in and navigates to the Projects tab. */
export async function signInAtProjects(page: Page) {
  await signIn(page);
  await page.goto("/projects");
}

/**
 * Adds a client through the UI and returns its name. Projects need one to
 * belong to, and going through the form keeps the fixture honest.
 */
export async function addClientNamed(page: Page, name: string) {
  await page.goto("/clients");
  await page.getByRole("button", { name: "Add client" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByLabel("Phone", { exact: true }).fill("+91 98000 00000");
  await dialog.getByRole("button", { name: "Add client" }).click();
  await dialog.waitFor({ state: "hidden" });
  return name;
}

/**
 * The order reference the app issued for a project, found by its client.
 *
 * Order references are generated, so a test cannot choose one up front; the
 * unique client name is the handle instead. Cleanup finds these projects
 * through their E2E client, not through the reference.
 */
export async function orderIdForClient(page: Page, client: string): Promise<string> {
  await page.goto("/projects");
  await page.getByLabel("Search projects").fill(client);
  await expect(page.getByText(/of 1 projects/)).toBeVisible();
  const link = page.getByRole("link", { name: /^ORD\d+$/ }).first();
  await expect(link).toBeVisible();
  return (await link.textContent())!.trim();
}

/** Signs in and navigates to the Exporters tab. */
export async function signInAtExporters(page: Page) {
  await signIn(page);
  await page.goto("/exporters");
}
