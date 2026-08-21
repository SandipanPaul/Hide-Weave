import Database from "better-sqlite3";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { backupName, createBackup, listBackups, toPrune, verifyBackup } from "../scripts/backup";
import { restoreBackup } from "../scripts/restore";

/**
 * Backups are the one piece of tooling that must work the first time it is
 * needed, and by then it is too late to find out. These run against real
 * SQLite files in a temp directory, not mocks.
 */

let workspace: string;
let dbPath: string;

/** A database with the tables the scripts report counts for. */
function makeDatabase(path: string, clients: number) {
  const db = new Database(path);
  for (const table of ["Client", "Project", "Payment", "Exporter", "ClientSampling"]) {
    db.exec(`CREATE TABLE "${table}" (id TEXT PRIMARY KEY, name TEXT)`);
  }
  const insert = db.prepare(`INSERT INTO "Client" (id, name) VALUES (?, ?)`);
  for (let i = 0; i < clients; i += 1) insert.run(`c${i}`, `Client ${i}`);
  db.close();
}

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), "hw-backup-"));
  dbPath = join(workspace, "dev.db");
  makeDatabase(dbPath, 3);
});

afterEach(() => rmSync(workspace, { recursive: true, force: true }));

describe("createBackup", () => {
  it("writes a real database, not a copy of bytes", () => {
    const dir = join(workspace, "backups");
    const result = createBackup({ databaseUrl: `file:${dbPath}`, dir });

    expect(existsSync(result.path)).toBe(true);
    // The proof: it opens as SQLite and holds the same rows.
    expect(verifyBackup(result.path).Client).toBe(3);
  });

  it("keeps working while the database is being written to", () => {
    // A backup taken during use is the normal case, not the exception.
    const live = new Database(dbPath);
    live.prepare(`INSERT INTO "Client" (id, name) VALUES (?, ?)`).run("c99", "Mid-write");

    const dir = join(workspace, "backups");
    const result = createBackup({ databaseUrl: `file:${dbPath}`, dir });
    live.close();

    expect(verifyBackup(result.path).Client).toBe(4);
  });

  it("understands both a file: URL and a plain path", () => {
    const dir = join(workspace, "backups");
    expect(() => createBackup({ databaseUrl: dbPath, dir })).not.toThrow();
  });

  it("refuses to run against a database that is not there", () => {
    expect(() =>
      createBackup({ databaseUrl: join(workspace, "missing.db"), dir: workspace }),
    ).toThrow(/No database at/);
  });

  it("names backups so they sort oldest to newest", () => {
    const first = backupName(new Date("2026-01-05T09:07:00Z"));
    const second = backupName(new Date("2026-11-30T22:41:00Z"));
    expect([second, first].sort()).toEqual([first, second]);
    expect(first).toBe("hide-and-weave-2026-01-05-09-07.db");
  });
});

describe("toPrune", () => {
  const names = [
    "hide-and-weave-2026-01-01-00-00.db",
    "hide-and-weave-2026-01-02-00-00.db",
    "hide-and-weave-2026-01-03-00-00.db",
    "hide-and-weave-2026-01-04-00-00.db",
  ];

  it("keeps the newest and drops the rest", () => {
    expect(toPrune(names, 2)).toEqual([
      "hide-and-weave-2026-01-02-00-00.db",
      "hide-and-weave-2026-01-01-00-00.db",
    ]);
  });

  it("drops nothing when there are fewer backups than the limit", () => {
    expect(toPrune(names, 10)).toEqual([]);
  });

  it("refuses a limit that would delete everything", () => {
    // The one mistake a backup script must never make.
    expect(() => toPrune(names, 0)).toThrow(/at least 1/);
  });
});

describe("listBackups", () => {
  it("returns newest first and ignores anything else in the folder", () => {
    const dir = join(workspace, "backups");
    createBackup({ databaseUrl: dbPath, dir, now: new Date("2026-01-01T00:00:00Z") });
    createBackup({ databaseUrl: dbPath, dir, now: new Date("2026-02-01T00:00:00Z") });
    writeFileSync(join(dir, "notes.txt"), "not a backup");

    expect(listBackups(dir)).toEqual([
      "hide-and-weave-2026-02-01-00-00.db",
      "hide-and-weave-2026-01-01-00-00.db",
    ]);
  });

  it("is empty rather than throwing when the folder does not exist", () => {
    expect(listBackups(join(workspace, "nope"))).toEqual([]);
  });

  it("prunes down to the limit as backups accumulate", () => {
    const dir = join(workspace, "backups");
    for (const day of ["01", "02", "03", "04", "05"]) {
      createBackup({ databaseUrl: dbPath, dir, keep: 3, now: new Date(`2026-03-${day}T00:00:00Z`) });
    }
    expect(readdirSync(dir)).toHaveLength(3);
    expect(listBackups(dir)[0]).toContain("2026-03-05");
  });
});

describe("restoreBackup", () => {
  it("puts the backed-up data back", () => {
    const dir = join(workspace, "backups");
    createBackup({ databaseUrl: dbPath, dir });

    // Something goes wrong: the live database loses its rows.
    const live = new Database(dbPath);
    live.exec(`DELETE FROM "Client"`);
    live.close();
    expect(verifyBackup(dbPath).Client).toBe(0);

    restoreBackup({ dir, databaseUrl: dbPath });
    expect(verifyBackup(dbPath).Client).toBe(3);
  });

  it("keeps a copy of what it replaced", () => {
    const dir = join(workspace, "backups");
    createBackup({ databaseUrl: dbPath, dir });

    const live = new Database(dbPath);
    live.prepare(`INSERT INTO "Client" (id, name) VALUES (?, ?)`).run("c50", "Only in live");
    live.close();

    const result = restoreBackup({ dir, databaseUrl: dbPath });
    expect(result.replacedCopy).not.toBeNull();
    // Restoring the wrong backup must not be the end of the story.
    expect(verifyBackup(result.replacedCopy as string).Client).toBe(4);
  });

  it("restores the newest backup when none is named", () => {
    const dir = join(workspace, "backups");
    createBackup({ databaseUrl: dbPath, dir, now: new Date("2026-01-01T00:00:00Z") });

    const live = new Database(dbPath);
    live.prepare(`INSERT INTO "Client" (id, name) VALUES (?, ?)`).run("c50", "Later");
    live.close();
    createBackup({ databaseUrl: dbPath, dir, now: new Date("2026-02-01T00:00:00Z") });

    const wiped = new Database(dbPath);
    wiped.exec(`DELETE FROM "Client"`);
    wiped.close();
    restoreBackup({ dir, databaseUrl: dbPath });

    // The February backup, which has four clients — not January's three.
    expect(verifyBackup(dbPath).Client).toBe(4);
  });

  it("says what is available when asked for a backup that is not", () => {
    const dir = join(workspace, "backups");
    createBackup({ databaseUrl: dbPath, dir });
    expect(() => restoreBackup({ dir, name: "nope.db", databaseUrl: dbPath })).toThrow(
      /does not exist/,
    );
  });

  it("refuses when there are no backups at all", () => {
    expect(() => restoreBackup({ dir: join(workspace, "empty"), databaseUrl: dbPath })).toThrow(
      /No backups/,
    );
  });
});
