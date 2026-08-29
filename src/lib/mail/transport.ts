import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

/**
 * Mail goes out through the user's own mail account over SMTP, authenticated
 * with an address and an app password. Gmail and Yahoo both work this way —
 * see providers.ts for the hosts.
 *
 * That choice is what makes replies work: the client sees the address they
 * already correspond with, replies land in the normal inbox, and a copy
 * appears in the account's Sent folder without this app having to keep its own.
 * A transactional API would deliver better at volume but would need a domain
 * and DNS records, and its mail would be invisible from the user's own mailbox.
 *
 * Every one of these providers caps how much can be sent in a day and throttles
 * bursts, which is why the sender paces itself — see send.ts.
 *
 * Where the credentials come from is settings.ts, not here: this module only
 * knows how to open a connection with them.
 */

export type MailConfig = {
  user: string;
  password: string;
  /** Display name on the From header. The address is always `user`. */
  fromName: string;
  /** SMTP hostname, resolved from the provider preset or typed by hand. */
  host: string;
  port: number;
  /** True for implicit TLS (465); false negotiates STARTTLS instead (587). */
  secure: boolean;
};

let cached: { key: string; transporter: Transporter } | null = null;

/**
 * A pooled transporter, reused across sends.
 *
 * Pooling keeps one authenticated connection open for a whole campaign instead
 * of handshaking 100 times, which is both faster and much less likely to look
 * like abuse to the provider. Keyed on the settings, so saving new ones takes
 * effect on the next send with no restart and no stale connection left open.
 */
export function mailTransport(config: MailConfig): Transporter {
  // The whole config is the key, not just the credentials: switching provider
  // without changing password must not keep talking to the old host.
  const key = JSON.stringify(config);
  if (cached?.key === key) return cached.transporter;

  cached?.transporter.close();
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    // On a STARTTLS port, insist the upgrade actually happens rather than
    // silently sending the password over a plain connection if the server
    // does not offer it.
    requireTLS: !config.secure,
    auth: { user: config.user, pass: config.password },
    pool: true,
    maxConnections: 1,
    maxMessages: 100,
  });
  cached = { key, transporter };
  return transporter;
}

/**
 * Opens a connection and authenticates, without sending anything.
 *
 * Used by the "send a test" button on the settings page: credentials typed into
 * a form need somewhere to be proved, and finding out they were wrong halfway
 * through a hundred-client campaign is too late.
 */
export async function verifyMailConfig(config: MailConfig): Promise<void> {
  await mailTransport(config).verify();
}
