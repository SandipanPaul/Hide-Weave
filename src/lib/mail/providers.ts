/**
 * The mail accounts this app can send through.
 *
 * Both are plain SMTP with an address and an app password, so supporting one is
 * a host and a port rather than new code.
 *
 * Outlook is deliberately absent. Microsoft has withdrawn password-based SMTP
 * from personal Outlook.com accounts, and the OAuth sign-in that replaces it
 * needs the user to create and maintain their own Azure app registration —
 * enough setup, and enough ways to get it subtly wrong, that it was not worth
 * carrying for an account nobody here sends from.
 *
 * Free of Prisma and `next/headers` on purpose: the settings form renders these
 * labels in the browser, and the transport reads the same hosts on the server.
 */

export const MAIL_PROVIDERS = ["gmail", "yahoo"] as const;
export type MailProvider = (typeof MAIL_PROVIDERS)[number];

export const DEFAULT_PROVIDER: MailProvider = "gmail";

export type ProviderPreset = {
  label: string;
  host: string;
  port: number;
  /**
   * True for implicit TLS (port 465). False means STARTTLS is negotiated on a
   * plain connection (port 587) — still encrypted, just later.
   */
  secure: boolean;
  /** Where to create an app password. */
  appPasswordUrl: string;
  /** What to tell the user about getting one. */
  passwordHint: string;
  /** Roughly how many messages a day the account allows. */
  dailyLimit: string;
};

export const PROVIDER_PRESETS: Record<MailProvider, ProviderPreset> = {
  gmail: {
    label: "Gmail",
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    appPasswordUrl: "https://myaccount.google.com/apppasswords",
    passwordHint:
      "A Google app password, not your account password. Turn on 2-step verification first, then create one — Google shows it as four groups of four.",
    dailyLimit: "about 500 a day on a personal account",
  },
  yahoo: {
    label: "Yahoo Mail",
    host: "smtp.mail.yahoo.com",
    port: 465,
    secure: true,
    appPasswordUrl: "https://login.yahoo.com/account/security",
    passwordHint:
      "A Yahoo app password, not your account password. Generate one under Account Security → Generate app password.",
    dailyLimit: "about 500 a day",
  },
};

export function isMailProvider(value: unknown): value is MailProvider {
  return typeof value === "string" && (MAIL_PROVIDERS as readonly string[]).includes(value);
}
