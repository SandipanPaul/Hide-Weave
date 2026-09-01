"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SUPPLIER_TYPES, SUPPLIER_TYPE_LABELS } from "@/lib/enums";

/**
 * Narrowing the list to one kind of supplier.
 *
 * Links rather than buttons, so a filtered list is a URL that can be kept and
 * shared — the same reason search and sorting live in the query string. A
 * supplier that is both a tannery and an exporter appears under both, which is
 * the point of letting them be both.
 */
export function TypeFilter({
  current,
  counts,
}: {
  current: string;
  counts: Record<string, number>;
}) {
  const pathname = usePathname();
  const params = useSearchParams();

  const hrefFor = (type: string) => {
    const next = new URLSearchParams(params);
    if (type === "ALL") next.delete("type");
    else next.set("type", type);
    // A filter change starts from the first page; page 3 of the old filter is
    // meaningless under the new one.
    next.delete("page");
    const query = next.toString();
    return query ? `${pathname}?${query}` : pathname;
  };

  return (
    <div className="flex flex-wrap gap-1">
      {(["ALL", ...SUPPLIER_TYPES] as const).map((type) => {
        const active = current === type;
        return (
          <Button
            key={type}
            size="sm"
            variant={active ? "secondary" : "ghost"}
            nativeButton={false}
            aria-current={active ? "true" : undefined}
            render={<Link href={hrefFor(type)} />}
          >
            {type === "ALL" ? "All" : SUPPLIER_TYPE_LABELS[type]}
            <span className="ml-1 text-xs text-muted-foreground">{counts[type] ?? 0}</span>
          </Button>
        );
      })}
    </div>
  );
}
