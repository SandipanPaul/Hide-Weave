"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * The date range and currency every figure on this page respects, held in the
 * URL so a particular view can be bookmarked and shared.
 */
export function FinancesFilters({
  from,
  to,
  currency,
  currencies,
  isDefault,
}: {
  from: string;
  to: string;
  currency: string;
  currencies: Array<{ currency: string; projects: number }>;
  /** Whether the current view is the default 12 months. */
  isDefault: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const go = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    const query = params.toString();
    router.push(query ? `/finances?${query}` : "/finances", { scroll: false });
  };

  return (
    <div className="mb-6 flex flex-wrap items-start gap-3">
      <div className="space-y-1.5">
        <Label htmlFor="range-from">From</Label>
        <Input
          id="range-from"
          type="date"
          className="w-[10.5rem]"
          value={from}
          onChange={(event) => go("from", event.target.value || null)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="range-to">To</Label>
        <Input
          id="range-to"
          type="date"
          className="w-[10.5rem]"
          value={to}
          onChange={(event) => go("to", event.target.value || null)}
        />
      </div>

      {/* Currencies are never converted, so this is a choice of which set of
          books to look at — not a display preference. */}
      {currencies.length > 1 ? (
        <div className="space-y-1.5">
          <Label htmlFor="range-currency">Currency</Label>
          <Select
            value={currency}
            onValueChange={(next) => go("currency", next === null ? null : String(next))}
          >
            <SelectTrigger id="range-currency" className="w-[11rem]">
              <SelectValue>{(value) => String(value ?? "")}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {currencies.map((option) => (
                <SelectItem key={option.currency} value={option.currency}>
                  {option.currency} ({option.projects})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {!isDefault ? (
        <Button
          variant="ghost"
          size="sm"
          className="mt-[1.625rem] text-muted-foreground"
          onClick={() => router.push("/finances", { scroll: false })}
        >
          <RotateCcw className="size-4" aria-hidden />
          Last 12 months
        </Button>
      ) : null}
    </div>
  );
}
