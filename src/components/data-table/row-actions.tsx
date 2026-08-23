"use client";

import { Loader2, Pencil, Trash2 } from "lucide-react";
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
import { Button } from "@/components/ui/button";

/**
 * The edit-and-delete pair at the end of a row, with the delete behind a
 * confirmation.
 *
 * Every list in the app had its own copy of this: same two ghost icon buttons,
 * same alert dialog, same "Keep it" cancel. The labels are what actually
 * differed, so they are the props — and because they are required rather than
 * defaulted, a new list cannot quietly ship a row of unlabelled icon buttons
 * that a screen reader reads as "button, button".
 */
export function RowActions({
  editLabel,
  onEdit,
  deleteLabel,
  confirmTitle,
  confirmDescription,
  confirmLabel,
  onDelete,
  pending = false,
}: {
  /** Omitted when a row can be removed but not corrected. */
  editLabel?: string;
  onEdit?: () => void;
  /** What the delete button announces — name the row, not just "delete". */
  deleteLabel: string;
  confirmTitle: string;
  /** Say what will change, not just that something will be deleted. */
  confirmDescription: React.ReactNode;
  confirmLabel: string;
  onDelete: () => void;
  pending?: boolean;
}) {
  return (
    <span className="flex items-center gap-1">
      {onEdit && editLabel ? (
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={pending}
          aria-label={editLabel}
          onClick={onEdit}
        >
          <Pencil className="size-4" aria-hidden />
        </Button>
      ) : null}

      <AlertDialog>
        <AlertDialogTrigger
          render={<Button variant="ghost" size="icon-sm" disabled={pending} aria-label={deleteLabel} />}
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Trash2 className="size-4" aria-hidden />
          )}
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>{confirmDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete}>{confirmLabel}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </span>
  );
}
