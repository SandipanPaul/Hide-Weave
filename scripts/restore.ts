import { copyFileSync, existsSync } from "node:fs";
import { basename, join } from "node:path";
import {
  DEFAULT_BACKUP_DIR,
  databaseFile,
  listBackups,
  verifyBackup,
} from "./backup";

/**
 * Puts a backup back.
 *
 * The database being replaced is copied aside first, because the usual reason
 * to restore is that something went wrong — and the second-worst outcome is
 * discovering the backup was the wrong one with nothing left to go back to.
 *
 * Stop the app first: replacing the file under a running server leaves it
 * holding a handle to a database that no longer exists.
 */
export function restoreBackup({
  name,
  dir = DEFAULT_BACKUP_DIR,
  databaseUrl,
}: {
  /** A file in the backup directory. Defaults to the most recent. */
  name?: string;
  dir?: string;
  databaseUrl?: string;
}): { restored: string; replacedCopy: string | null } {
  const available = listBackups(dir);
  if (available.length === 0) throw new Error(`No backups in ${dir}.`);

  const chosen = name ?? available[0];
  const source = join(dir, chosen);
  if (!existsSync(source)) {
    throw new Error(`${source} does not exist. Available:\n  ${available.join("\n  ")}`);
  }

  // Fail before touching anything if the backup is not a readable database.
  verifyBackup(source);

  const target = databaseFile(databaseUrl);
  let replacedCopy: string | null = null;
  if (existsSync(target)) {
    replacedCopy = `${target}.replaced-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    copyFileSync(target, replacedCopy);
  }

  copyFileSync(source, target);
  return { restored: source, replacedCopy };
}

if (process.argv[1] && basename(process.argv[1]).startsWith("restore")) {
  const requested = process.argv[2];
  const dir = process.env.BACKUP_DIR ?? DEFAULT_BACKUP_DIR;

  if (requested === "--list") {
    const available = listBackups(dir);
    console.log(available.length === 0 ? `No backups in ${dir}.` : available.join("\n"));
  } else {
    const result = restoreBackup({ name: requested, dir });
    const counts = verifyBackup(databaseFile());
    console.log(`Restored ${result.restored}`);
    if (result.replacedCopy) console.log(`  The database it replaced is at ${result.replacedCopy}`);
    console.log(
      "  " +
        Object.entries(counts)
          .map(([table, n]) => `${n} ${table.toLowerCase()}${n === 1 ? "" : "s"}`)
          .join(", "),
    );
  }
}
