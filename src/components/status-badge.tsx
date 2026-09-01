import { Badge } from "@/components/ui/badge";
import {
  CAMPAIGN_STATUS_LABELS,
  CLIENT_STATUS_LABELS,
  SUPPLIER_TYPE_LABELS,
  PROJECT_STATUS_LABELS,
  RECIPIENT_STATUS_LABELS,
  SAMPLING_STATUS_LABELS,
} from "@/lib/enums";

/**
 * Statuses are stored as plain strings, so every badge in the app renders one
 * of these rather than mapping labels and variants at the call site — that is
 * how the Clients table came to spell its own labels by hand.
 *
 * A value the app doesn't recognise is shown as it was stored rather than
 * swallowed: seeing "PENDNIG" beats seeing nothing.
 */
function label(labels: Record<string, string>, status: string): string {
  return labels[status] ?? status;
}

export function ClientStatusBadge({ status }: { status: string }) {
  // Someone being chased reads as in-progress rather than settled, so it gets
  // its own look instead of sharing "inactive"'s muted outline.
  const variant =
    status === "ACTIVE" ? "secondary" : status === "CHASING" ? "default" : "outline";
  return <Badge variant={variant}>{label(CLIENT_STATUS_LABELS, status)}</Badge>;
}

export function ProjectStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={status === "CANCELLED" ? "outline" : "secondary"}>
      {label(PROJECT_STATUS_LABELS, status)}
    </Badge>
  );
}

export function SamplingStatusBadge({ status }: { status: string }) {
  const variant =
    status === "COMPLETED" ? "secondary" : status === "CANCELLED" ? "outline" : "default";
  return <Badge variant={variant}>{label(SAMPLING_STATUS_LABELS, status)}</Badge>;
}

export function CampaignStatusBadge({ status }: { status: string }) {
  const variant = status === "COMPLETED" ? "secondary" : "default";
  return <Badge variant={variant}>{label(CAMPAIGN_STATUS_LABELS, status)}</Badge>;
}

export function RecipientStatusBadge({ status }: { status: string }) {
  // Failed is the one status worth interrupting a scan of the list for, so it
  // is the only one that gets the loud variant.
  const variant =
    status === "FAILED" ? "destructive" : status === "SENT" ? "secondary" : "outline";
  return <Badge variant={variant}>{label(RECIPIENT_STATUS_LABELS, status)}</Badge>;
}

/** What a supplier does. Several are normal, so these read as a row of chips. */
export function SupplierTypeBadges({ types }: { types: readonly string[] }) {
  if (types.length === 0) {
    return <span className="text-sm text-muted-foreground">Unclassified</span>;
  }
  return (
    <span className="flex flex-wrap gap-1">
      {types.map((type) => (
        <Badge key={type} variant="secondary">
          {label(SUPPLIER_TYPE_LABELS, type)}
        </Badge>
      ))}
    </span>
  );
}
