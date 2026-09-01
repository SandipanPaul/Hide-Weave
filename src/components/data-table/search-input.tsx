"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";

/**
 * Text search bound to the `q` URL param. Typing is debounced so each keystroke
 * doesn't hit the database, and the pending transition is shown rather than
 * leaving the table looking frozen.
 */
export function SearchInput({
  placeholder = "Search…",
  label = "Search",
}: {
  placeholder?: string;
  label?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const urlQuery = searchParams.get("q") ?? "";
  const [value, setValue] = useState(urlQuery);
  const [lastUrlQuery, setLastUrlQuery] = useState(urlQuery);
  const inputRef = useRef<HTMLInputElement>(null);

  // Re-sync when the URL changes from outside this input — the back button, or
  // a filter cleared elsewhere. Adjusting during render rather than in an
  // effect avoids a second render pass showing the stale value first.
  if (urlQuery !== lastUrlQuery) {
    setLastUrlQuery(urlQuery);
    setValue(urlQuery);
  }

  useEffect(() => {
    if (value === urlQuery) return;
    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set("q", value);
      else params.delete("q");
      // A new search invalidates the current page number.
      params.delete("page");
      const query = params.toString();
      startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname));
    }, 300);
    return () => clearTimeout(timer);
  }, [value, urlQuery, pathname, router, searchParams]);

  return (
    // Wide enough for the longest placeholder any tab passes in — at max-w-xs
    // the suppliers hint was cut to "Search company, contact, email, webs".
    // Still `w-full` underneath, so it shrinks on a narrow screen.
    <div className="relative w-full max-w-md">
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        ref={inputRef}
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="pl-8 pr-8"
      />
      {isPending ? (
        <Loader2
          className="absolute right-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
          aria-hidden
        />
      ) : value ? (
        <button
          type="button"
          onClick={() => {
            setValue("");
            inputRef.current?.focus();
          }}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
