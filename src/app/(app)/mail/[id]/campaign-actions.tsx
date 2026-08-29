"use client";

import { RefreshCw, RotateCcw } from "lucide-react";
import { resumeCampaign, retryFailed } from "../actions";
import { useAction } from "@/components/form/use-action";
import { Button } from "@/components/ui/button";

/**
 * The two ways to push a stalled mailing forward.
 *
 * Kept apart on purpose. Resume only picks up recipients who were never
 * attempted; Retry deliberately re-attempts ones that were refused. Neither
 * can write to somebody twice — both work only on rows that are not SENT.
 */
export function CampaignActions({
  id,
  pendingCount,
  failedCount,
}: {
  id: string;
  pendingCount: number;
  failedCount: number;
}) {
  const { run, pending } = useAction();

  if (pendingCount === 0 && failedCount === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {pendingCount > 0 ? (
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => run(() => resumeCampaign(id), "Picking up where it stopped.")}
        >
          <RefreshCw className="size-4" aria-hidden />
          Send the remaining {pendingCount}
        </Button>
      ) : null}

      {failedCount > 0 ? (
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => run(() => retryFailed(id), "Trying the failed ones again.")}
        >
          <RotateCcw className="size-4" aria-hidden />
          Retry {failedCount} failed
        </Button>
      ) : null}
    </div>
  );
}
