"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Building2, FolderKanban, Mail, Users } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Ordered by how often each tab is opened, not by entity hierarchy: projects
 * are the daily unit of work, clients and suppliers are master data consulted
 * while recording them, and finances is a periodic review of what it all
 * earned and cost. Mail comes last: writing to everyone at once is an
 * occasional job, not a daily one. Left to right: the work, who it is for, who
 * supplies it, what came of it, and reaching out to them all.
 */
const TABS = [
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/suppliers", label: "Suppliers", icon: Building2 },
  { href: "/finances", label: "Finances", icon: BarChart3 },
  { href: "/mail", label: "Mail", icon: Mail },
] as const;

export function MainNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className="flex gap-1">
      {TABS.map(({ href, label, icon: Icon }) => {
        // A tab stays active on its detail pages, e.g. /clients/abc123.
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              active
                ? "bg-secondary text-secondary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
