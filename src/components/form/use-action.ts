"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/schemas";

/**
 * Running one server action from a button: pending state, a toast either way,
 * and a refresh so the page catches up with what changed.
 *
 * Every list in the app had its own copy of this — the same transition, the
 * same `formErrors[0] ?? "That didn't work"` fallback. Having it once means a
 * failed action can never silently do nothing, which is what a hand-written
 * copy that forgot the else branch would do.
 *
 * For forms, `useActionState` is still the right tool; this is for the buttons
 * beside them, which have no fields to validate.
 */
export function useAction(): {
  run: (action: () => Promise<ActionResult<unknown>>, success: string) => void;
  pending: boolean;
} {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<ActionResult<unknown>>, success: string) => {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(success);
        // The server owns every figure on screen, so the page is re-read
        // rather than patched locally — nothing can drift out of step.
        router.refresh();
      } else {
        toast.error(result.formErrors[0] ?? "That didn't work. Please try again.");
      }
    });
  };

  return { run, pending };
}
