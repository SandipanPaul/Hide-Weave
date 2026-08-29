import "server-only";
import { prisma } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/mail/secrets";
import {
  DEFAULT_PROVIDER,
  PROVIDER_PRESETS,
  isMailProvider,
  type MailProvider,
} from "@/lib/mail/providers";
import type { MailConfig } from "@/lib/mail/transport";

/**
 * Where the mail credentials live.
 *
 * Two sources, in this order:
 *
 *   1. The database, written from the settings page.
 *   2. The `MAIL_*` environment variables.
 *
 * The database wins, because it is the one a person can change on a deployed
 * server without a shell. The environment variables remain as a fallback so an
 * install that was already configured that way keeps working untouched, and so
 * the app can be set up before it has ever been opened.
 *
 * Nothing here ever returns the stored password to a page — see
 * `mailSettingsView`, which reports only whether one exists.
 */

const KEYS = {
  user: "mail.user",
  password: "mail.appPassword",
  fromName: "mail.fromName",
  provider: "mail.provider",
} as const;

const DEFAULT_FROM_NAME = "Hide & Weave";

async function readSettings(): Promise<Partial<Record<keyof typeof KEYS, string>>> {
  const rows = await prisma.setting.findMany({
    where: { key: { in: Object.values(KEYS) } },
    select: { key: true, value: true },
  });

  const byKey = new Map(rows.map((row) => [row.key, row.value]));
  return {
    user: byKey.get(KEYS.user),
    password: byKey.get(KEYS.password),
    fromName: byKey.get(KEYS.fromName),
    provider: byKey.get(KEYS.provider),
  };
}

/** The connection details for a provider. */
function connection(provider: MailProvider) {
  const { host, port, secure } = PROVIDER_PRESETS[provider];
  return { host, port, secure };
}

function envProvider(): MailProvider {
  const value = process.env.MAIL_PROVIDER?.trim().toLowerCase();
  return isMailProvider(value) ? value : DEFAULT_PROVIDER;
}

function envConfig(): MailConfig | null {
  const user = process.env.MAIL_USER?.trim();
  const password = process.env.MAIL_APP_PASSWORD?.trim();
  if (!user || !password) return null;

  return {
    user,
    password,
    fromName: process.env.MAIL_FROM_NAME?.trim() || DEFAULT_FROM_NAME,
    ...connection(envProvider()),
  };
}

/**
 * The credentials to send with, or null when mail is not usable.
 *
 * Async because it reads the database — every caller is already in an async
 * server context, and the alternative (caching it in memory) would mean a
 * password saved on the settings page did not take effect until a restart,
 * which is exactly the problem this feature exists to solve.
 */
export async function mailConfig(): Promise<MailConfig | null> {
  const stored = await readSettings();

  if (stored.user && stored.password) {
    const password = decryptSecret(stored.password);
    // A password that will not decrypt means SESSION_SECRET has changed. Not
    // falling through to the environment on purpose: the saved settings are
    // what the user last chose, and quietly sending from an older address
    // instead would be worse than saying mail is not set up.
    if (!password) return null;

    const provider = isMailProvider(stored.provider) ? stored.provider : DEFAULT_PROVIDER;
    return {
      user: stored.user,
      password,
      fromName: stored.fromName || DEFAULT_FROM_NAME,
      ...connection(provider),
    };
  }

  return envConfig();
}

/**
 * Whether mail can be sent, without decrypting anything.
 *
 * Every page branches on this, so it checks that the pieces are present and
 * leaves finding out whether they still work to the send itself.
 */
export async function isMailConfigured(): Promise<boolean> {
  const stored = await readSettings();
  if (stored.user && stored.password) return true;
  return envConfig() !== null;
}

export type MailSettingsView = {
  user: string;
  fromName: string;
  provider: MailProvider;
  /** True when a password is stored — the password itself is never sent out. */
  hasPassword: boolean;
  /**
   * A password is stored but cannot be decrypted, which means SESSION_SECRET
   * changed. It has to be entered again; nothing can recover the old one.
   */
  passwordUnreadable: boolean;
  /** Which of the two sources is in force, for the page to explain itself. */
  source: "settings" | "environment" | "none";
};

/** What the settings form renders. Never includes the password. */
export async function mailSettingsView(): Promise<MailSettingsView> {
  const stored = await readSettings();
  const provider = isMailProvider(stored.provider) ? stored.provider : DEFAULT_PROVIDER;

  if (stored.user && stored.password) {
    return {
      user: stored.user,
      fromName: stored.fromName || "",
      provider,
      hasPassword: true,
      passwordUnreadable: decryptSecret(stored.password) === null,
      source: "settings",
    };
  }

  const env = envConfig();
  if (env) {
    return {
      user: env.user,
      fromName: env.fromName,
      provider: envProvider(),
      hasPassword: true,
      passwordUnreadable: false,
      source: "environment",
    };
  }

  return {
    // A half-saved row (an address with no password) is still worth showing
    // back, so the field is not blank when the form reopens.
    user: stored.user ?? "",
    fromName: stored.fromName ?? "",
    provider,
    hasPassword: false,
    passwordUnreadable: false,
    source: "none",
  };
}

async function put(key: string, value: string) {
  await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
}

/**
 * Saves what the settings form submitted.
 *
 * `password` is undefined when the field was left blank, which means "keep the
 * one already saved" — the form cannot show the stored password back, so an
 * empty box must not be read as "clear it". Clearing is `clearMailSettings`.
 */
export async function saveMailSettings(input: {
  user: string;
  fromName: string;
  password?: string;
  provider?: MailProvider;
}): Promise<void> {
  await put(KEYS.user, input.user);
  await put(KEYS.fromName, input.fromName);
  await put(KEYS.provider, input.provider ?? DEFAULT_PROVIDER);
  if (input.password !== undefined) {
    await put(KEYS.password, encryptSecret(input.password));
  }
}

/**
 * Forgets the saved credentials.
 *
 * After this the environment variables take over again if they are set, and
 * otherwise mail is simply not configured.
 */
export async function clearMailSettings(): Promise<void> {
  await prisma.setting.deleteMany({ where: { key: { startsWith: "mail." } } });
}
