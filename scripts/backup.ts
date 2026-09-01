import "dotenv/config";
import Database from "better-sqlite3";
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { basename, join, resolve } from "node:path";

/**
 * Snapshots the database to a file you can copy off the machine.
 *
 * `VACUUM INTO` rather than a file copy: it takes a read lock and writes a
 * consistent, compacted database, so a backup taken while the app is running
 * is a real database rather than a torn one. Copying `dev.db` by hand can
 * catch a half-written page, and misses the WAL entirely.
 *
 * There is no scheduler here on purpose — this is a command, and cron or a
 * systemd timer decides when to run it.
 */

export const DEFAULT_BACKUP_DIR = "backups";
const DEFAULT_KEEP = 14;

/** `file:./prisma/dev.db` and `./prisma/dev.db` both mean the same path. */
export function databaseFile(databaseUrl = process.env.DATABASE_URL): string {
  const raw = databaseUrl ?? "file:./prisma/dev.db";
  return resolve(raw.replace(/^file:/, ""));
}

/** Backups sort by name because the timestamp is fixed-width and big-endian. */
export function backupName(now = new Date()): string {
  const stamp = now.toISOString().replace(/[:T]/g, "-").slice(0, 16);
  return `hide-and-weave-${stamp}.db`;
}

export function listBackups(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.startsWith("hide-and-weave-") && name.endsWith(".db"))
    .sort()
    .reverse();
}

/**
 * Which backups to remove, newest kept.
 *
 * Pure and separately tested: deleting the wrong file here is the one mistake
 * a backup script must never make.
 */
export function toPrune(names: string[], keep = DEFAULT_KEEP): string[] {
  if (keep < 1) throw new Error("Refusing to prune every backup: keep must be at least 1.");
  return [...names].sort().reverse().slice(keep);
}

export type BackupResult = { path: string; bytes: number; pruned: string[] };

export function createBackup({
  databaseUrl,
  dir = DEFAULT_BACKUP_DIR,
  keep = DEFAULT_KEEP,
  now = new Date(),
}: {
  databaseUrl?: string;
  dir?: string;
  keep?: number;
  now?: Date;
} = {}): BackupResult {
  const source = databaseFile(databaseUrl);
  if (!existsSync(source)) {
    throw new Error(`No database at ${source}. Run \`npm run db:migrate\` first.`);
  }

  mkdirSync(dir, { recursive: true });
  const target = join(dir, backupName(now));
  if (existsSync(target)) {
    throw new Error(`${target} already exists — a backup was taken this minute.`);
  }

  const db = new Database(source, { readonly: true });
  try {
    // Parameterised: the path is interpolated by SQLite, not by us.
    db.prepare("VACUUM INTO ?").run(target);
  } finally {
    db.close();
  }

  const pruned = toPrune(listBackups(dir), keep);
  for (const name of pruned) unlinkSync(join(dir, name));

  return { path: target, bytes: statSync(target).size, pruned };
}

/** Reads a backup to prove it opens and says how much is in it. */
export function verifyBackup(path: string): Record<string, number> {
  const db = new Database(path, { readonly: true });
  try {
    const counts: Record<string, number> = {};
    for (const table of ["Client", "Project", "Payment", "Supplier", "ClientSampling"]) {
      const row = db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get() as { n: number };
      counts[table] = row.n;
    }
    return counts;
  } finally {
    db.close();
  }
}

if (process.argv[1] && basename(process.argv[1]).startsWith("backup")) {
  const keep = Number(process.env.BACKUP_KEEP ?? DEFAULT_KEEP);
  const result = createBackup({ dir: process.env.BACKUP_DIR ?? DEFAULT_BACKUP_DIR, keep });
  const counts = verifyBackup(result.path);

  console.log(`Backed up to ${result.path} (${(result.bytes / 1024).toFixed(0)} KB)`);
  console.log(
    "  " +
      Object.entries(counts)
        .map(([table, n]) => `${n} ${table.toLowerCase()}${n === 1 ? "" : "s"}`)
        .join(", "),
  );
  if (result.pruned.length > 0) {
    console.log(`  Pruned ${result.pruned.length} older backup(s), keeping ${keep}.`);
  }
}
