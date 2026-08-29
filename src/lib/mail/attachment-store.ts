import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

/**
 * Where attachment bytes live: on disk, beside the database, named by the id of
 * the row that describes them.
 *
 * The database keeps the record — filename, type, size, and the id that is the
 * file's name here. It does not keep the bytes, because the weekly backup
 * copies the database and every megabyte of every attachment would be copied
 * into all fourteen retained backups along with it.
 *
 * The consequence is stated plainly rather than hidden: **attachments are not
 * in the backups.** That is the right trade for these files — an attachment is
 * the payload of a mail that has already gone, not a business record like the
 * ledger — but it means a restored backup lists what was attached and cannot
 * re-send it.
 */

/**
 * Beside the database rather than beside the code: a deploy replaces the
 * checkout, and files sitting under it would go with it. Data belongs with
 * data.
 */
function attachmentsDir(): string {
  const configured = process.env.ATTACHMENTS_DIR?.trim();
  if (configured) return resolve(configured);

  const url = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
  const path = url.startsWith("file:") ? url.slice("file:".length) : url;
  return join(dirname(resolve(path)), "attachments");
}

/**
 * Ids come from the database (cuid) and are used verbatim as filenames, so a
 * value that is not one has no business reaching the filesystem. Belt and
 * braces against a path escaping the directory.
 */
function pathFor(id: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error(`Unsafe attachment id: ${id}`);
  return join(attachmentsDir(), id);
}

export async function writeAttachment(id: string, content: Buffer): Promise<void> {
  await mkdir(attachmentsDir(), { recursive: true });
  await writeFile(pathFor(id), content);
}

/**
 * Reads one back, or null when it is gone — a restored backup, or a file
 * removed by hand. Null rather than a throw so the sender can say "the
 * attachment is missing" instead of failing with a path.
 */
export async function readAttachment(id: string): Promise<Buffer | null> {
  try {
    return await readFile(pathFor(id));
  } catch {
    return null;
  }
}

/** Removes files. Never throws: a missing file is already the desired state. */
export async function deleteAttachments(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => rm(pathFor(id), { force: true }).catch(() => {})));
}
