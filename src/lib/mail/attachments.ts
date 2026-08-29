/**
 * What may be attached to a mailing, and how much of it.
 *
 * Pure, and free of Prisma and `next/headers`: the compose screen checks a
 * selection the moment it is made, and the server action checks the same rules
 * again before storing anything. One implementation means the screen cannot
 * accept a file the send would refuse.
 */

/**
 * Gmail and Yahoo both cap a message at 25 MB, and attachments are base64
 * encoded on the wire, which adds about a third. 15 MB of files is roughly
 * 20 MB sent — comfortably inside the cap with room for the message itself.
 */
export const MAX_TOTAL_BYTES = 15 * 1024 * 1024;

/** No single file may fill the whole budget, so several can be sent together. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/**
 * PDFs and images.
 *
 * A deliberate allow-list rather than "anything": these go to clients over the
 * user's own account, and a mail carrying an unexpected executable is the kind
 * of thing that damages a sender's reputation. Widening it is a line here.
 */
const ALLOWED_TYPES: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/gif": [".gif"],
  "image/webp": [".webp"],
  "image/heic": [".heic"],
};

/** For the file input's `accept`, so the picker offers the right files first. */
export const ACCEPT_ATTRIBUTE = Object.entries(ALLOWED_TYPES)
  .flatMap(([type, extensions]) => [type, ...extensions])
  .join(",");

const EXTENSIONS = new Set(Object.values(ALLOWED_TYPES).flat());

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot).toLowerCase();
}

/**
 * True when a file is one of the kinds allowed.
 *
 * Checks the extension when the browser reports no type, which it does for
 * some files and on some platforms — refusing those would reject perfectly
 * ordinary PDFs.
 */
export function isAllowedType(file: { name: string; type: string }): boolean {
  if (file.type && file.type in ALLOWED_TYPES) return true;
  if (file.type) return false;
  return EXTENSIONS.has(extensionOf(file.name));
}

/** The type to record, falling back to the extension when the browser gave none. */
export function resolveContentType(file: { name: string; type: string }): string {
  if (file.type && file.type in ALLOWED_TYPES) return file.type;
  const extension = extensionOf(file.name);
  const match = Object.entries(ALLOWED_TYPES).find(([, extensions]) =>
    extensions.includes(extension),
  );
  return match?.[0] ?? "application/octet-stream";
}

/** "2.4 MB" — sizes are only ever read to judge whether something is too big. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export type AttachmentProblem = { filename: string; reason: string };

/**
 * Checks a whole selection at once.
 *
 * Returns every problem rather than the first, so a person fixing a selection
 * of six files learns about all of them in one go instead of one per attempt.
 */
export function checkAttachments(
  files: { name: string; type: string; size: number }[],
): { problems: AttachmentProblem[]; totalBytes: number } {
  const problems: AttachmentProblem[] = [];
  let totalBytes = 0;

  for (const file of files) {
    totalBytes += file.size;

    if (!isAllowedType(file)) {
      problems.push({
        filename: file.name,
        reason: "only PDFs and images can be attached",
      });
      continue;
    }
    if (file.size > MAX_FILE_BYTES) {
      problems.push({
        filename: file.name,
        reason: `${formatBytes(file.size)} is over the ${formatBytes(MAX_FILE_BYTES)} limit for one file`,
      });
    }
    if (file.size === 0) {
      problems.push({ filename: file.name, reason: "the file is empty" });
    }
  }

  if (totalBytes > MAX_TOTAL_BYTES) {
    problems.push({
      filename: "",
      reason: `${formatBytes(totalBytes)} of attachments is over the ${formatBytes(MAX_TOTAL_BYTES)} limit for one mailing`,
    });
  }

  return { problems, totalBytes };
}
