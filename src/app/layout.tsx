import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Hide & Weave",
  description: "Clients, projects, exporters and the commission they earn.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning on <html>: the theme is applied by a script
    // before paint, so the class the server rendered never matches the one the
    // browser ends up with. This is next-themes' documented requirement, and it
    // silences that one attribute diff, not anything inside the app.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/*
        Browser extensions (Grammarly and friends) inject attributes onto <body>
        between the server render and hydration. Suppressing here keeps the dev
        console honest — it only silences attribute diffs on this one element,
        not anywhere inside the app.
      */}
      <body
        suppressHydrationWarning
        className="flex min-h-full flex-col bg-background text-foreground"
      >
        <ThemeProvider>
          {children}
          <Toaster position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
