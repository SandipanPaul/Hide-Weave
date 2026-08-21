"use client";

import { ThemeProvider as NextThemes } from "next-themes";

/**
 * Applies the reader's theme by putting a `dark` class on <html>, which is
 * what `globals.css` and every `dark:` variant in the app key off.
 *
 * Defaults to following the operating system, so the app matches everything
 * else on the screen until the reader says otherwise.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemes
      attribute="class"
      defaultTheme="system"
      enableSystem
      // Without this, switching theme animates every colour on the page at
      // once, which reads as a flash rather than a change.
      disableTransitionOnChange
    >
      {children}
    </NextThemes>
  );
}
