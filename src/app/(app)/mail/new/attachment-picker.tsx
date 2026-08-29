"use client";

import { useRef } from "react";
import { FileText, Image as ImageIcon, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ACCEPT_ATTRIBUTE,
  MAX_TOTAL_BYTES,
  checkAttachments,
  formatBytes,
} from "@/lib/mail/attachments";

/**
 * Files to send with the mailing.
 *
 * The chosen files live in React state, and the input is only a picker: a file
 * input cannot have items removed from it, so leaving it as the source of truth
 * would mean taking one file back out required re-picking all of them. The
 * form builds its own FormData from this state — see compose-form.tsx.
 */
export function AttachmentPicker({
  files,
  onFilesChange,
  checked,
  recipientCount,
  error,
}: {
  files: File[];
  onFilesChange: (files: File[]) => void;
  /** The result of checking `files`, done once by the form and shared. */
  checked: ReturnType<typeof checkAttachments>;
  /** Used to say what the whole mailing will weigh, which is the surprising part. */
  recipientCount: number;
  error?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  /** Adds a pick to the list, ignoring a file that is already on it. */
  const add = (chosen: FileList | null) => {
    if (!chosen) return;
    const existing = new Set(files.map((file) => `${file.name}:${file.size}`));
    const added = Array.from(chosen).filter(
      (file) => !existing.has(`${file.name}:${file.size}`),
    );
    onFilesChange([...files, ...added]);
    // Cleared so re-picking the same file after removing it still fires a
    // change event.
    if (inputRef.current) inputRef.current.value = "";
  };

  const { problems, totalBytes } = checked;
  // What actually goes over the wire, once for each recipient.
  const overTheWire = totalBytes * Math.max(recipientCount, 1);

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Attachments</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
        >
          <Paperclip className="size-4" aria-hidden />
          Add files
        </Button>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT_ATTRIBUTE}
        className="sr-only"
        aria-label="Attach files"
        onChange={(event) => add(event.target.files)}
      />

      <p className="text-xs text-muted-foreground">
        PDFs and images, up to {formatBytes(MAX_TOTAL_BYTES)} in total. Every recipient
        gets their own copy.
      </p>

      {files.length > 0 ? (
        <ul className="space-y-1">
          {files.map((file) => (
            <li
              key={`${file.name}:${file.size}`}
              className="flex items-center gap-2 rounded-md bg-muted/50 px-2 py-1.5 text-sm"
            >
              {file.type.startsWith("image/") ? (
                <ImageIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              ) : (
                <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              )}
              <span className="min-w-0 flex-1 truncate" title={file.name}>
                {file.name}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatBytes(file.size)}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${file.name}`}
                onClick={() => onFilesChange(files.filter((other) => other !== file))}
              >
                <X className="size-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      {problems.length > 0 ? (
        <ul role="alert" className="space-y-1 text-sm text-destructive">
          {problems.map((problem) => (
            <li key={`${problem.filename}:${problem.reason}`}>
              {problem.filename ? `${problem.filename}: ` : ""}
              {problem.reason}
            </li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {files.length > 0 && problems.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {formatBytes(totalBytes)} each &middot; about {formatBytes(overTheWire)} to send
          altogether
          {overTheWire > 100 * 1024 * 1024
            ? " — that will take a while, and the account's daily limit counts messages, not size."
            : "."}
        </p>
      ) : null}
    </div>
  );
}
