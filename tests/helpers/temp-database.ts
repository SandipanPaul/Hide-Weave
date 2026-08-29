import Database from "better-sqlite3";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { vi } from "vitest";

/**
 * A real, empty database in a temp directory, for tests that exercise queries
 * and actions rather than pure functions.
 *
 * This lived in three test files, copied. That was not just repetition: one
 * copy applied only the migrations whose *name* matched a keyword, so a later
 * migration to the same tables was silently skipped and those tests ran against
 * a schema the app no longer had. Having it once means that cannot happen
 * again.
 */

const MIGRATIONS = join(__dirname, "..", "..", "prisma", "migrations");

export type TempDatabase = {
  /** The directory holding the database and its attachments. */
  workspace: string;
  dbPath: string;
  /** Where attachment bytes go — beside the database, as in production. */
  attachmentsPath: string;
  /** Opens a connection for a test to read or seed with. Caller closes it. */
  open: () => Database.Database;
  destroy: () => void;
};

/**
 * Applies every migration in order.
 *
 * Foreign keys are off during the run because migrations rebuild tables that
 * others point at, which is the same thing `prisma migrate` does.
 */
function applyMigrations(path: string) {
  const db = new Database(path);
  db.pragma("foreign_keys=OFF");
  for (const dir of readdirSync(MIGRATIONS).sort()) {
    const file = join(MIGRATIONS, dir, "migration.sql");
    if (existsSync(file)) db.exec(readFileSync(file, "utf8"));
  }
  db.close();
}

/**
 * Creates the database and points the app at it.
 *
 * Also clears the Prisma client cached on `globalThis` — src/lib/db.ts keeps it
 * there outside production, so without this every test after the first would
 * reuse the first one's client, still pointing at a database that has since
 * been deleted.
 */
export function createTempDatabase(prefix: string): TempDatabase {
  const workspace = mkdtempSync(join(tmpdir(), prefix));
  const dbPath = join(workspace, "app.db");
  applyMigrations(dbPath);

  process.env.DATABASE_URL = `file:${dbPath}`;
  vi.resetModules();
  delete (globalThis as { prisma?: unknown }).prisma;

  return {
    workspace,
    dbPath,
    attachmentsPath: join(workspace, "attachments"),
    open: () => new Database(dbPath),
    destroy: () => rmSync(workspace, { recursive: true, force: true }),
  };
}
