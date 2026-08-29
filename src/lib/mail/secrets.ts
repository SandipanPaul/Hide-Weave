import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Encryption for secrets kept in the database.
 *
 * The Gmail app password has to be stored somewhere the app can read it back —
 * it is not a password to verify, it is a credential to present. So it is
 * encrypted rather than hashed, with a key derived from SESSION_SECRET.
 *
 * What this buys: the weekly backup copies the whole database, and those files
 * live on disk and get moved around. An attacker holding a backup does not
 * hold the mail password unless they also hold the `.env`. It is not protection
 * against someone who already has the server.
 *
 * Deliberately not in transport.ts and free of Prisma so it can be tested on
 * its own — this is the kind of code that must be right the first time.
 */

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * A 32-byte key from SESSION_SECRET.
 *
 * Domain-separated with a suffix so this key is not the same bytes as anything
 * else the secret is ever used for — the session cookie signs with the raw
 * secret, and reusing key material across two purposes is how one weakness
 * becomes two.
 */
function encryptionKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "SESSION_SECRET is missing or too short. It is needed to store the mail password safely.",
    );
  }
  return createHash("sha256").update(`${secret}|mail-settings`).digest();
}

/** Returns "iv.tag.ciphertext", all base64. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString("base64")).join(".");
}

/**
 * Reverses `encryptSecret`, or returns null if it cannot.
 *
 * Null rather than a throw, because the realistic cause is a changed
 * SESSION_SECRET — the stored value is then unreadable for good, and the app
 * should say "enter the password again" rather than crash on every page that
 * checks whether mail is set up.
 */
export function decryptSecret(stored: string): string | null {
  try {
    const [iv, tag, ciphertext] = stored.split(".").map((part) => Buffer.from(part, "base64"));
    if (!iv || !tag || !ciphertext) return null;
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) return null;

    const decipher = createDecipheriv(ALGORITHM, encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    // Wrong key, or bytes that have been tampered with — GCM catches both.
    return null;
  }
}
