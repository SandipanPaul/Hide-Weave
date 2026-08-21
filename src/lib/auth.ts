/**
 * Single-user password gate. There are no accounts, no OAuth, no sessions table
 * — just one shared password in an env var, exchanged for a signed cookie.
 *
 * Signing uses Web Crypto (not node:crypto) so this module runs unchanged in
 * the proxy (src/proxy.ts), whichever runtime Next puts it on.
 */

export const SESSION_COOKIE = "bd_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

function requireSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "SESSION_SECRET is missing or too short. Set it to a random string of at least 16 characters in .env",
    );
  }
  return secret;
}

function toBase64Url(bytes: ArrayBuffer): string {
  const binary = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(requireSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return toBase64Url(sig);
}

/** Compares without leaking length or position through timing. */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function isPasswordCorrect(candidate: string): boolean {
  const expected = process.env.APP_PASSWORD;
  if (!expected) {
    throw new Error("APP_PASSWORD is not set. Add it to .env before starting the app.");
  }
  return constantTimeEqual(candidate, expected);
}

/** Returns a cookie value of the form "<expiryMillis>.<signature>". */
export async function createSessionToken(now = Date.now()): Promise<string> {
  const expiresAt = now + SESSION_TTL_MS;
  const payload = String(expiresAt);
  return `${payload}.${await hmac(payload)}`;
}

export async function isSessionValid(
  token: string | undefined,
  now = Date.now(),
): Promise<boolean> {
  if (!token) return false;
  const separator = token.lastIndexOf(".");
  if (separator <= 0) return false;

  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  if (!/^\d+$/.test(payload)) return false;
  if (Number(payload) < now) return false; // expired

  try {
    return constantTimeEqual(signature, await hmac(payload));
  } catch {
    return false; // misconfigured secret — fail closed
  }
}

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  secure: process.env.NODE_ENV === "production",
  maxAge: SESSION_TTL_MS / 1000,
} as const;
