import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, isSessionValid } from "@/lib/auth";

/**
 * Gates the entire app behind the password. Everything except the login route
 * and Next's own static assets requires a valid session cookie.
 *
 * This is Next 16's `proxy` convention — the former `middleware.ts`.
 */
export async function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (await isSessionValid(token)) return NextResponse.next();

  const loginUrl = new URL("/login", request.url);
  // Send the user back where they were headed once they authenticate.
  const intended = request.nextUrl.pathname + request.nextUrl.search;
  if (intended && intended !== "/") loginUrl.searchParams.set("next", intended);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    // Everything except: the login page, Next internals, and static files.
    "/((?!login|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)",
  ],
};
