import { Badge } from "@/components/ui/badge";
import {
  CLIENT_STATUS_LABELS,
  PROJECT_STATUS_LABELS,
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
  return (
    <Badge variant={status === "ACTIVE" ? "secondary" : "outline"}>
      {label(CLIENT_STATUS_LABELS, status)}
    </Badge>
  );
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
