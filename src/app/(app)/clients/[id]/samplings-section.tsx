"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, CalendarPlus, Check, ChevronDown, Loader2, Pencil, Trash2, X } from "lucide-react";
import {
  createSampling,
  deleteSampling,
  setSamplingStatus,
  updateSampling,
} from "../actions";
import { Field } from "@/components/form/field";
import { FormErrors } from "@/components/form/form-errors";
import { SubmitButton } from "@/components/form/submit-button";
import { EmptyState } from "@/components/layout/empty-state";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { SamplingStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { SamplingStatus } from "@/lib/enums";
import type { ActionResult } from "@/lib/schemas";

/** Dates arrive as plain YYYY-MM-DD strings so the browser can't shift them. */
export type SamplingView = {
  id: string;
  scheduledDate: string;
  displayDate: string;
  product: string | null;
  status: SamplingStatus;
  notes: string | null;
  isPast: boolean;
};

/** Add and edit share these fields; edit simply starts with values filled in. */
function SamplingFields({
  errors,
  defaults,
}: {
  errors: ActionResult<{ id: string }> | null;
  defaults?: Partial<SamplingView>;
}) {
  const fieldError = (name: string) =>
    errors && !errors.ok ? errors.fieldErrors[name]?.[0] : undefined;

  return (
    <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
      <Field label="Date" required error={fieldError("scheduledDate")}>
        {(props) => (
          <Input
            {...props}
            name="scheduledDate"
            type="date"
            defaultValue={defaults?.scheduledDate}
            required
            className="w-[11rem]"
          />
        )}
      </Field>

      <Field label="Product" error={fieldError("product")} hint="Optional">
        {(props) => (
          <Input
            {...props}
            name="product"
            defaultValue={defaults?.product ?? ""}
            placeholder="What are they sampling?"
          />
        )}
      </Field>

      <Field label="Notes" error={fieldError("notes")} className="sm:col-span-2">
        {(props) => (
          <Textarea {...props} name="notes" rows={2} defaultValue={defaults?.notes ?? ""} />
        )}
      </Field>
    </div>
  );
}

function AddSamplingForm({ clientId, onDone }: { clientId: string; onDone: () => void }) {
  const router = useRouter();
  const [state, formAction] = useActionState<ActionResult<{ id: string }> | null, FormData>(
    createSampling,
    null,
  );

  useEffect(() => {
    if (state?.ok) {
      toast.success("Sampling added.");
      onDone();
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction} className="space-y-3 rounded-lg border bg-muted/30 p-4">
      <input type="hidden" name="clientId" value={clientId} />
      {state && !state.ok ? <FormErrors errors={state.formErrors} /> : null}
      <SamplingFields errors={state} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <SubmitButton size="sm" pendingLabel="Adding…">
          Add sampling
        </SubmitButton>
      </div>
    </form>
  );
}

function EditSamplingForm({
  sampling,
  clientId,
  onDone,
}: {
  sampling: SamplingView;
  clientId: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const boundUpdate = updateSampling.bind(null, sampling.id);
  const [state, formAction] = useActionState<ActionResult<{ id: string }> | null, FormData>(
    boundUpdate,
    null,
  );

  useEffect(() => {
    if (state?.ok) {
      toast.success("Sampling updated.");
      onDone();
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction} className="space-y-3 rounded-lg border bg-muted/30 p-4">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="status" value={sampling.status} />
      {state && !state.ok ? <FormErrors errors={state.formErrors} /> : null}
      <SamplingFields errors={state} defaults={sampling} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <SubmitButton size="sm">Save changes</SubmitButton>
      </div>
    </form>
  );
}

function SamplingRow({ sampling, clientId }: { sampling: SamplingView; clientId: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();

  const run = (work: () => Promise<ActionResult>, successMessage: string) => {
    startTransition(async () => {
      const result = await work();
      if (result.ok) {
        toast.success(successMessage);
        router.refresh();
      } else {
        toast.error(result.formErrors[0] ?? "That didn't work. Please try again.");
      }
    });
  };

  if (editing) {
    return (
      <li>
        <EditSamplingForm
          sampling={sampling}
          clientId={clientId}
          onDone={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5">
      <span className="w-[7.5rem] shrink-0 font-medium tabular-nums">{sampling.displayDate}</span>
      <span className="min-w-0 flex-1 truncate">
        {sampling.product ?? <span className="text-muted-foreground">No product noted</span>}
        {sampling.notes ? (
          <span className="ml-2 text-xs text-muted-foreground">{sampling.notes}</span>
        ) : null}
      </span>

      <SamplingStatusBadge status={sampling.status} />

      <div className="flex items-center gap-1">
        {isPending ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
        ) : null}

        {sampling.status === "SCHEDULED" ? (
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={isPending}
              aria-label={`Mark sampling on ${sampling.displayDate} complete`}
              onClick={() =>
                run(() => setSamplingStatus(sampling.id, "COMPLETED"), "Marked complete.")
              }
            >
              <Check className="size-4" aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={isPending}
              aria-label={`Cancel sampling on ${sampling.displayDate}`}
              onClick={() =>
                run(() => setSamplingStatus(sampling.id, "CANCELLED"), "Sampling cancelled.")
              }
            >
              <Ban className="size-4" aria-hidden />
            </Button>
          </>
        ) : (
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={isPending}
            aria-label={`Reopen sampling on ${sampling.displayDate}`}
            onClick={() => run(() => setSamplingStatus(sampling.id, "SCHEDULED"), "Reopened.")}
          >
            <X className="size-4" aria-hidden />
          </Button>
        )}

        <Button
          variant="ghost"
          size="icon-sm"
          disabled={isPending}
          aria-label={`Edit sampling on ${sampling.displayDate}`}
          onClick={() => setEditing(true)}
        >
          <Pencil className="size-4" aria-hidden />
        </Button>

        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={isPending}
                aria-label={`Delete sampling on ${sampling.displayDate}`}
              />
            }
          >
            <Trash2 className="size-4" aria-hidden />
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this sampling?</AlertDialogTitle>
              <AlertDialogDescription>
                The sampling on {sampling.displayDate}
                {sampling.product ? ` for ${sampling.product}` : ""} will be removed from this
                client.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep it</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => run(() => deleteSampling(sampling.id), "Sampling deleted.")}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </li>
  );
}

export function SamplingsSection({
  clientId,
  upcoming,
  past,
}: {
  clientId: string;
  upcoming: SamplingView[];
  past: SamplingView[];
}) {
  const [adding, setAdding] = useState(false);
  const [showPast, setShowPast] = useState(false);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle>Samplings</CardTitle>
        {!adding ? (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <CalendarPlus className="size-4" aria-hidden />
            Add sampling
          </Button>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-4">
        {adding ? <AddSamplingForm clientId={clientId} onDone={() => setAdding(false)} /> : null}

        {upcoming.length > 0 ? (
          <div className="space-y-2">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Upcoming
            </h3>
            <ul className="space-y-2">
              {upcoming.map((sampling) => (
                <SamplingRow key={sampling.id} sampling={sampling} clientId={clientId} />
              ))}
            </ul>
          </div>
        ) : past.length > 0 && !adding ? (
          <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
            Nothing scheduled. Past samplings are below.
          </p>
        ) : null}

        {upcoming.length === 0 && past.length === 0 && !adding ? (
          <EmptyState
            title="No samplings yet"
            description="Record when this client is sampling a product, so it shows up on the dashboard."
            action={
              <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
                <CalendarPlus className="size-4" aria-hidden />
                Add the first one
              </Button>
            }
          />
        ) : null}

        {past.length > 0 ? (
          <div className="space-y-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowPast((current) => !current)}
              aria-expanded={showPast}
              className="text-muted-foreground"
            >
              <ChevronDown
                className={`size-4 transition-transform ${showPast ? "rotate-180" : ""}`}
                aria-hidden
              />
              {showPast ? "Hide" : "Show"} past samplings ({past.length})
            </Button>

            {showPast ? (
              <ul className="space-y-2">
                {past.map((sampling) => (
                  <SamplingRow key={sampling.id} sampling={sampling} clientId={clientId} />
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
