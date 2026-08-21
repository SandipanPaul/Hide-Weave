"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  createSessionToken,
  isPasswordCorrect,
} from "@/lib/auth";

const loginSchema = z.object({
  password: z.string().min(1, "Enter the password."),
  // FormData.get returns null for an absent field, and null is not undefined —
  // so this must accept null explicitly, or a login with no ?next= param fails
  // to parse and reports a misleading "enter the password" error.
  next: z.string().nullish(),
});

export type LoginState = { error?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    password: formData.get("password"),
    next: formData.get("next"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Enter the password." };
  }

  try {
    if (!isPasswordCorrect(parsed.data.password)) {
      return { error: "That password is not correct." };
    }
  } catch (err) {
    // Misconfiguration (no APP_PASSWORD) — say so plainly rather than
    // pretending the password was wrong.
    return { error: err instanceof Error ? err.message : "Login is not configured." };
  }

  const store = await cookies();
  store.set(SESSION_COOKIE, await createSessionToken(), SESSION_COOKIE_OPTIONS);

  // Only ever redirect to a path on this app, never to an absolute URL.
  const target =
    parsed.data.next && parsed.data.next.startsWith("/") && !parsed.data.next.startsWith("//")
      ? parsed.data.next
      : "/projects";
  redirect(target);
}

export async function logout() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login");
}
