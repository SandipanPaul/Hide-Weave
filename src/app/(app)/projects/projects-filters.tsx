"use client";

import { useRouter } from "next/navigation";
import { X } from "lucide-react";
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
import { PROJECT_STATUSES, PROJECT_STATUS_LABELS } from "@/lib/enums";
import { buildListHref, filterHref, type ListParams } from "@/lib/list-params";

const PATH = "/projects";

/**
 * Client, status, date-range and currency filters, all held in the URL so a
 * narrowed view can be bookmarked or shared, and the back button undoes it.
 *
 * Every control writes through `filterHref`, which returns to page 1 — page 4
 * of the old filter has nothing to do with the new one.
 */
export function ProjectsFilters({
  params,
  clients,
  currencies,
}: {
  params: ListParams;
  clients: Array<{ id: string; name: string }>;
  currencies: string[];
}) {
  const router = useRouter();
  const go = (key: string, value: string | null) =>
    router.push(filterHref(PATH, params, key, value), { scroll: false });

  const active = Object.keys(params.filters).length > 0;

  const clientOptions = [
    { value: "", label: "All clients" },
    ...clients.map((client) => ({ value: client.id, label: client.name })),
  ];
  const statusOptions = [
    { value: "", label: "Any status" },
    ...PROJECT_STATUSES.map((status) => ({ value: status, label: PROJECT_STATUS_LABELS[status] })),
  ];
  const currencyOptions = [
    { value: "", label: "All currencies" },
    ...currencies.map((currency) => ({ value: currency, label: currency })),
  ];

  return (
    <div className="mb-4 flex flex-wrap items-end gap-3">
      <FilterSelect
        id="filter-client"
        label="Client"
        options={clientOptions}
        value={params.filters.clientId ?? ""}
        onChange={(value) => go("clientId", value || null)}
        className="w-[13rem]"
      />

      <FilterSelect
        id="filter-status"
        label="Status"
        options={statusOptions}
        value={params.filters.status ?? ""}
        onChange={(value) => go("status", value || null)}
        className="w-[11rem]"
      />

      {/* Only worth showing once there is more than one currency to choose. */}
      {currencies.length > 1 ? (
        <FilterSelect
          id="filter-currency"
          label="Currency"
          options={currencyOptions}
          value={params.filters.currency ?? ""}
          onChange={(value) => go("currency", value || null)}
          className="w-[9rem]"
        />
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="filter-from">Ordered from</Label>
        <Input
          id="filter-from"
          type="date"
          className="w-[10.5rem]"
          value={params.filters.from ?? ""}
          onChange={(event) => go("from", event.target.value || null)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="filter-to">Ordered to</Label>
        <Input
          id="filter-to"
          type="date"
          className="w-[10.5rem]"
          value={params.filters.to ?? ""}
          onChange={(event) => go("to", event.target.value || null)}
        />
      </div>

      {active ? (
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() =>
            router.push(buildListHref(PATH, params, { filters: {}, page: 1 }), { scroll: false })
          }
        >
          <X className="size-4" aria-hidden />
          Clear filters
        </Button>
      ) : null}
    </div>
  );
}

function FilterSelect({
  id,
  label,
  options,
  value,
  onChange,
  className,
}: {
  id: string;
  label: string;
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const labelFor = (raw: unknown) =>
    options.find((option) => option.value === raw)?.label ?? String(raw ?? "");

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={(next) => onChange(next === null ? "" : String(next))}>
        <SelectTrigger id={id} className={className}>
          <SelectValue>{(raw) => labelFor(raw)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
