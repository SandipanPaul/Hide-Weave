"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle } from "lucide-react";
import { login, type LoginState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Checking…" : "Unlock"}
    </Button>
  );
}

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction] = useActionState<LoginState, FormData>(login, {});

  return (
    <form action={formAction} className="space-y-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          aria-describedby={state.error ? "password-error" : undefined}
          aria-invalid={state.error ? true : undefined}
        />
      </div>

      {state.error ? (
        <p
          id="password-error"
          role="alert"
          className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{state.error}</span>
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}
