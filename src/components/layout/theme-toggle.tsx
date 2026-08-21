"use client";

import { useTheme } from "next-themes";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

/**
 * Light, dark, or follow the system.
 *
 * The trigger's icon is swapped by CSS rather than by state: the server cannot
 * know the reader's theme, so choosing an icon in JS means either a hydration
 * mismatch or a `mounted` flag that flickers. Keying off the same `dark` class
 * the theme itself uses means the icon can never disagree with the page.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-sm" className="text-muted-foreground" />}
        aria-label="Change theme"
      >
        <Sun className="size-4 dark:hidden" aria-hidden />
        <Moon className="hidden size-4 dark:block" aria-hidden />
      </DropdownMenuTrigger>

      {/* The menu only mounts when opened, which is after hydration — so the
          tick beside the current choice is safe to render from state. */}
      <DropdownMenuContent align="end">
        {OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => setTheme(option.value)}
            aria-current={theme === option.value ? "true" : undefined}
          >
            <option.icon className="size-4" aria-hidden />
            {option.label}
            {theme === option.value ? (
              <Check className="ml-auto size-3.5" aria-hidden />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
