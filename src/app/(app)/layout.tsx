import Link from "next/link";
import { LogOut } from "lucide-react";
import { logout } from "@/app/login/actions";
import { MainNav } from "@/components/layout/main-nav";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";

/**
 * Shell for every authenticated page. Everything inside this route group sits
 * behind the password gate enforced in src/middleware.ts.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-[1600px] items-center gap-6 px-4 sm:px-6">
          <Link
            href="/projects"
            className="shrink-0 text-sm font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Hide & Weave
          </Link>
          <MainNav />
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <form action={logout}>
              <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground">
                <LogOut className="size-4" aria-hidden />
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
