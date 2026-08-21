"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * The "add a record" dialog every tab opens from its page header.
 *
 * The form is rendered through a function rather than as children so it only
 * exists while the dialog is open: remounting on each open is what clears
 * anything typed into a form that was cancelled.
 */
export function AddDialog({
  triggerLabel,
  title,
  description,
  className,
  onClose,
  children,
}: {
  triggerLabel: string;
  title: string;
  description: string;
  /** Clears any state the caller keeps alongside the form. */
  onClose?: () => void;
  /** Width of the dialog, which differs by how much the form holds. */
  className?: string;
  children: (helpers: { close: () => void; done: () => void }) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) onClose?.();
      }}
    >
      <DialogTrigger render={<Button />}>
        <Plus className="size-4" aria-hidden />
        {triggerLabel}
      </DialogTrigger>

      <DialogContent className={`min-w-0 ${className ?? "sm:max-w-2xl"}`}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {open
          ? children({
              close: () => {
                setOpen(false);
                onClose?.();
              },
              // Saved: close, and pull the list behind the dialog up to date.
              done: () => {
                setOpen(false);
                onClose?.();
                router.refresh();
              },
            })
          : null}
      </DialogContent>
    </Dialog>
  );
}
