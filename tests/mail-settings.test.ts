import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTempDatabase, type TempDatabase } from "./helpers/temp-database";

/**
 * Which credentials win, against a real database.
 *
 * The rules matter more than they look: getting them wrong means a mailing
 * goes out from an address the user did not choose, to a hundred clients, with
 * no way to take it back.
 */

let db: TempDatabase;

async function load() {
  return import("@/lib/mail/settings");
}

beforeEach(() => {
  db = createTempDatabase("hw-settings-");
  process.env.SESSION_SECRET = "a-long-enough-test-secret-value";
  delete process.env.MAIL_USER;
  delete process.env.MAIL_APP_PASSWORD;
  delete process.env.MAIL_FROM_NAME;
  delete process.env.MAIL_PROVIDER;
});

afterEach(() => db.destroy());

describe("providers", () => {
  it("uses each preset's own server", async () => {
    const { mailConfig, saveMailSettings } = await load();

    await saveMailSettings({ user: "a@yahoo.com", fromName: "", password: "pw", provider: "yahoo" });
    expect(await mailConfig()).toMatchObject({
      host: "smtp.mail.yahoo.com",
      port: 465,
      secure: true,
    });

    await saveMailSettings({ user: "a@gmail.com", fromName: "", password: "pw", provider: "gmail" });
    expect(await mailConfig()).toMatchObject({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
    });
  });

  it("reads the provider from the environment too", async () => {
    process.env.MAIL_USER = "env@yahoo.com";
    process.env.MAIL_APP_PASSWORD = "envpassword";
    process.env.MAIL_PROVIDER = "yahoo";

    const { mailConfig } = await load();
    expect(await mailConfig()).toMatchObject({ host: "smtp.mail.yahoo.com", port: 465 });
  });

  it("falls back to Gmail when the environment names a provider that no longer exists", async () => {
    process.env.MAIL_USER = "env@example.com";
    process.env.MAIL_APP_PASSWORD = "envpassword";
    // Outlook was removed; an old .env naming it must not break the app.
    process.env.MAIL_PROVIDER = "outlook";

    const { mailConfig } = await load();
    expect(await mailConfig()).toMatchObject({ host: "smtp.gmail.com" });
  });
});

describe("mailConfig", () => {
  it("is null when nothing is configured anywhere", async () => {
    const { mailConfig, mailSettingsView } = await load();
    expect(await mailConfig()).toBeNull();
    expect(await mailSettingsView()).toMatchObject({ source: "none", hasPassword: false });
  });

  it("falls back to the environment when nothing is saved", async () => {
    process.env.MAIL_USER = "env@gmail.com";
    process.env.MAIL_APP_PASSWORD = "envpassword";
    process.env.MAIL_FROM_NAME = "From Env";

    const { mailConfig, mailSettingsView } = await load();
    expect(await mailConfig()).toEqual({
      user: "env@gmail.com",
      password: "envpassword",
      fromName: "From Env",
      // Gmail is the default when MAIL_PROVIDER says nothing.
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
    });
    expect((await mailSettingsView()).source).toBe("environment");
  });

  it("ignores a half-set environment", async () => {
    process.env.MAIL_USER = "env@gmail.com"; // no password
    const { mailConfig } = await load();
    expect(await mailConfig()).toBeNull();
  });

  it("prefers what was saved in the app over the environment", async () => {
    process.env.MAIL_USER = "env@gmail.com";
    process.env.MAIL_APP_PASSWORD = "envpassword";

    const { mailConfig, saveMailSettings, mailSettingsView } = await load();
    await saveMailSettings({
      user: "saved@gmail.com",
      fromName: "Saved Name",
      password: "savedpassword",
    });

    expect(await mailConfig()).toMatchObject({
      user: "saved@gmail.com",
      password: "savedpassword",
      fromName: "Saved Name",
    });
    expect((await mailSettingsView()).source).toBe("settings");
  });

  it("never writes the password to the database in the clear", async () => {
    const { saveMailSettings } = await load();
    await saveMailSettings({ user: "a@gmail.com", fromName: "", password: "hunter2secret" });

    const connection = db.open();
    const values = (connection.prepare(`SELECT value FROM "Setting"`).all() as { value: string }[])
      .map((row) => row.value)
      .join("|");
    connection.close();
    expect(values).not.toContain("hunter2secret");
  });

  it("keeps the stored password when the field is left blank", async () => {
    const { mailConfig, saveMailSettings } = await load();
    await saveMailSettings({ user: "a@gmail.com", fromName: "A", password: "original" });
    // password omitted — what the form sends when the box is empty.
    await saveMailSettings({ user: "b@gmail.com", fromName: "B" });

    expect(await mailConfig()).toMatchObject({
      user: "b@gmail.com",
      password: "original",
      fromName: "B",
    });
  });

  it("falls back to the app name when no sender name is given", async () => {
    const { mailConfig, saveMailSettings } = await load();
    await saveMailSettings({ user: "a@gmail.com", fromName: "", password: "pw" });
    expect((await mailConfig())?.fromName).toBe("Hide & Weave");
  });

  it("reports mail as unconfigured, not as the environment, when the secret changed", async () => {
    process.env.MAIL_USER = "env@gmail.com";
    process.env.MAIL_APP_PASSWORD = "envpassword";

    const { saveMailSettings } = await load();
    await saveMailSettings({ user: "saved@gmail.com", fromName: "", password: "savedpassword" });

    // SESSION_SECRET rotated: the stored password can no longer be decrypted.
    process.env.SESSION_SECRET = "an-entirely-different-secret-!!";
    vi.resetModules();
    delete (globalThis as { prisma?: unknown }).prisma;
    const reloaded = await load();

    // Silently sending from the old environment address instead would be worse
    // than refusing: the user chose the saved one.
    expect(await reloaded.mailConfig()).toBeNull();
    expect(await reloaded.mailSettingsView()).toMatchObject({
      source: "settings",
      user: "saved@gmail.com",
      passwordUnreadable: true,
    });
  });

  it("hands back to the environment once the saved details are forgotten", async () => {
    process.env.MAIL_USER = "env@gmail.com";
    process.env.MAIL_APP_PASSWORD = "envpassword";

    const { clearMailSettings, mailConfig, saveMailSettings } = await load();
    await saveMailSettings({ user: "saved@gmail.com", fromName: "", password: "savedpassword" });
    await clearMailSettings();

    expect((await mailConfig())?.user).toBe("env@gmail.com");
  });
});
