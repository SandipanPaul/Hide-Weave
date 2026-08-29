"use client";

import { useMemo, useState } from "react";
import { Search, UserRound, Building, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ClientStatusBadge } from "@/components/status-badge";
import { CLIENT_STATUSES, CLIENT_STATUS_LABELS, type ClientStatus } from "@/lib/enums";
import { countryName } from "@/lib/countries";
import type { MailableClient } from "@/lib/mail/queries";
import { cn } from "@/lib/utils";

/**
 * Choosing who a mailing goes to.
 *
 * Every control here narrows what is *shown*; none of them changes what is
 * *selected*. That separation is the whole point — filtering to "Active",
 * ticking them, then clearing the filter must not quietly drop them again.
 * The count under the list is therefore of the real selection, not of the
 * visible rows, so it can never flatter the user into thinking they are
 * writing to fewer people than they are.
 */
export function RecipientPicker({
  clients,
  selected,
  onSelectedChange,
}: {
  clients: MailableClient[];
  selected: Set<string>;
  onSelectedChange: (next: Set<string>) => void;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ClientStatus | "ALL">("ALL");

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return clients.filter((client) => {
      if (status !== "ALL" && client.status !== status) return false;
      if (needle === "") return true;
      return (
        client.name.toLowerCase().includes(needle) ||
        client.email.toLowerCase().includes(needle) ||
        (client.code?.toLowerCase().includes(needle) ?? false)
      );
    });
  }, [clients, query, status]);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedChange(next);
  };

  // The selection in list order, so the chips read the same way the list does
  // rather than in the order things happened to be ticked.
  const chosen = clients.filter((client) => selected.has(client.id));

  const visibleIds = visible.map((client) => client.id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  const toggleVisible = () => {
    const next = new Set(selected);
    for (const id of visibleIds) {
      if (allVisibleSelected) next.delete(id);
      else next.add(id);
    }
    onSelectedChange(next);
  };

  return (
    <div className="flex min-h-0 flex-col rounded-lg border">
      <div className="space-y-3 border-b p-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, email or ID…"
            aria-label="Search clients"
            className="pl-8"
          />
        </div>

        <div className="flex flex-wrap gap-1">
          {(["ALL", ...CLIENT_STATUSES] as const).map((option) => (
            <Button
              key={option}
              type="button"
              size="sm"
              variant={status === option ? "secondary" : "ghost"}
              onClick={() => setStatus(option)}
              aria-pressed={status === option}
            >
              {option === "ALL" ? "All" : CLIENT_STATUS_LABELS[option]}
            </Button>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2 text-sm">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={toggleVisible}
            disabled={visibleIds.length === 0}
          >
            {allVisibleSelected ? "Clear these" : `Select these ${visibleIds.length}`}
          </Button>
          {selected.size > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onSelectedChange(new Set())}
            >
              Deselect all {selected.size}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="max-h-[26rem] min-h-0 overflow-y-auto">
        {visible.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">
            {clients.length === 0
              ? "No client has an email address yet. You can still type addresses below."
              : "No clients match that."}
          </p>
        ) : (
          <ul className="divide-y">
            {visible.map((client) => {
              const isSelected = selected.has(client.id);
              return (
                <li key={client.id}>
                  <label
                    className={cn(
                      "flex cursor-pointer items-start gap-3 px-3 py-2.5 transition-colors hover:bg-muted/60",
                      isSelected && "bg-muted/40",
                    )}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggle(client.id)}
                      className="mt-0.5"
                      aria-label={`Write to ${client.name}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium">{client.name}</span>
                        <ClientStatusBadge status={client.status} />
                        {client.code ? (
                          <span className="font-mono text-xs text-muted-foreground">
                            {client.code}
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        <span className="truncate">{client.email}</span>
                        {client.country ? <span>· {countryName(client.country)}</span> : null}
                      </span>
                      {/* Shows what <name> will become, because "Dear Meridian
                          Foods Ltd" is the kind of thing worth catching here
                          rather than in a reply. */}
                      <span className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                        {client.isCompanyGreeting ? (
                          <Building className="size-3" aria-hidden />
                        ) : (
                          <UserRound className="size-3" aria-hidden />
                        )}
                        &lt;name&gt; → {client.greeting}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="space-y-2 border-t px-3 py-2 text-sm">
        <div className="flex items-baseline justify-between gap-2">
          <Badge variant="secondary">{selected.size} selected</Badge>
          <span className="text-xs text-muted-foreground">
            of {clients.length} client{clients.length === 1 ? "" : "s"} with an email address
          </span>
        </div>

        {/* Named, not just counted. Scrolling a long list to work out who is
            ticked is exactly the check a person wants to make before sending,
            and a number does not answer it. */}
        {chosen.length > 0 ? (
          <ul className="flex max-h-32 flex-wrap gap-1 overflow-y-auto">
            {chosen.map((client) => (
              <li key={client.id}>
                <button
                  type="button"
                  onClick={() => toggle(client.id)}
                  aria-label={`Remove ${client.name}`}
                  title={`${client.name} — ${client.email}`}
                  className="inline-flex max-w-56 items-center gap-1 rounded-4xl bg-secondary px-2 py-0.5 text-xs text-secondary-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="truncate">{client.name}</span>
                  <X className="size-3 shrink-0" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">
            Nobody chosen yet. Tick the clients this should go to.
          </p>
        )}
      </div>
    </div>
  );
}
