"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { z } from "zod";
import { formatZodError, type ActionResult } from "@/lib/schemas";

/**
 * The plumbing every add/edit form in this app shares: controlled values, live
 * validation against the same Zod schema the server action enforces, and the
 * rule about when an error is allowed to appear.
 *
 * That rule is the reason this exists rather than being written three times:
 * a client error waits until the field has been **typed in**, never until it
 * has been blurred. Tabbing through a form, or clicking Cancel, must not
 * scold you about a field you never filled in.
 */

export type EntityFormAction = (
  prev: ActionResult<{ id: string }> | null,
  formData: FormData,
) => Promise<ActionResult<{ id: string }>>;

type Schema = { safeParse: (value: unknown) => z.ZodSafeParseResult<unknown> };

export function useEntityForm<Values extends Record<string, unknown>>({
  action,
  schema,
  initialValues,
  successMessage,
  onSuccess,
}: {
  action: EntityFormAction;
  /** The same schema the server action re-validates with. */
  schema: Schema;
  initialValues: Values;
  successMessage: string;
  onSuccess?: (id: string) => void;
}) {
  const [state, formAction] = useActionState<ActionResult<{ id: string }> | null, FormData>(
    action,
    null,
  );
  const [values, setValues] = useState<Values>(initialValues);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const markTouched = (field: string) =>
    setTouched((current) => (current[field] ? current : { ...current, [field]: true }));

  /** Sets one field and marks it touched, which is what typing means. */
  const setField = <K extends keyof Values & string>(field: K) =>
    (value: Values[K]) => {
      setValues((current) => ({ ...current, [field]: value }));
      markTouched(field);
    };

  const clientErrors = useMemo(() => {
    const parsed = schema.safeParse(values);
    if (parsed.success) return { formErrors: [] as string[], fieldErrors: {} as Record<string, string[]> };
    const { formErrors, fieldErrors } = formatZodError(parsed.error);
    return { formErrors, fieldErrors: fieldErrors as Record<string, string[]> };
    // The schema is a module constant; re-running on every keystroke is the point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values]);

  const serverErrors = state && !state.ok ? state : null;

  /** Server errors always show; client errors wait until the field is touched. */
  const errorFor = (field: string): string | undefined =>
    serverErrors?.fieldErrors[field]?.[0] ??
    (touched[field] ? clientErrors.fieldErrors[field]?.[0] : undefined);

  useEffect(() => {
    if (state?.ok) {
      toast.success(successMessage);
      onSuccess?.(state.data.id);
    }
    // Only a new result should fire this, not a new callback identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return {
    state,
    formAction,
    values,
    setValues,
    setField,
    touched,
    markTouched,
    errorFor,
    serverErrors,
    clientErrors,
  };
}
