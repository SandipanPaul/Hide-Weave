"use client";

import { Check, ChevronDown, Loader2 } from "lucide-react";
import { useAction } from "@/components/form/use-action";
import { ClientStatusBadge } from "@/components/status-badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CLIENT_STATUSES, CLIENT_STATUS_LABELS, type ClientStatus } from "@/lib/enums";
import type { ActionResult } from "@/lib/schemas";

/**
 * Changing a client's status where it is displayed, rather than through the
 * edit form.
 *
 * Status is the one field on a client that changes on its own schedule — a
 * name or an address is corrected once, a status moves as the relationship
 * does. Routing that through "edit the whole record, then save" cost five
 * clicks and two page loads for a single word.
 *
 * The badge is the trigger, so the thing you look at is the thing you press.
 * It keeps the badge's own colours, so the row reads the same whether or not
 * anyone can change it.
 */
export function ClientStatusPicker({
  clientId,
  status,
  setStatus,
}: {
  clientId: string;
  status: string;
  /** Passed in so this component holds no server import of its own. */
  setStatus: (clientId: string, status: string) => Promise<ActionResult>;
}) {
  const { run, pending } = useAction();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            disabled={pending}
            // Names both what pressing it does and where things stand, because
            // a badge alone reads as decoration to a screen reader.
            aria-label={`Status: ${CLIENT_STATUS_LABELS[status as ClientStatus] ?? status}. Change it.`}
            className="inline-flex items-center gap-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          />
        }
      >
        <ClientStatusBadge status={status} />
        {pending ? (
          <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-hidden />
        ) : (
          <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start">
        {CLIENT_STATUSES.map((option) => (
          <DropdownMenuItem
            key={option}
            aria-current={option === status ? "true" : undefined}
            onClick={() => {
              // Choosing what it already is would be a pointless write; the
              // action treats it as a no-op, and skipping it avoids the toast.
              if (option === status) return;
              run(
                () => setStatus(clientId, option),
                `Status changed to ${CLIENT_STATUS_LABELS[option]}.`,
              );
            }}
          >
            {CLIENT_STATUS_LABELS[option]}
            {option === status ? <Check className="ml-auto size-3.5" aria-hidden /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
