import Database from "better-sqlite3";
import "dotenv/config";

/**
 * Removes rows created by e2e runs, so the seeded dataset stays as seeded.
 *
 * Talks to SQLite directly rather than through Prisma: Playwright loads these
 * files as CommonJS, and the generated Prisma client is ESM-only.
 *
 * These are hard deletes — test fixtures should leave no trace, unlike the
 * app's own soft deletes.
 */
export function cleanupE2ERows(): number {
  const url = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
  const file = url.replace(/^file:/, "");

  const db = new Database(file);
  try {
    // Children first: a real delete has no cascade configured on SQLite unless
    // foreign keys are switched on for the connection.
    db.prepare(
      `DELETE FROM ClientSampling
        WHERE clientId IN (SELECT id FROM Client WHERE name LIKE 'E2E %')`,
    ).run();
    // Projects and their payments belong to E2E clients and go with them via
    // the schema's cascade, but a test may also have attached one to a seeded
    // client — those are named by order ID instead.
    db.prepare(
      `DELETE FROM Payment
        WHERE projectId IN (SELECT id FROM Project WHERE orderId LIKE 'E2E-%')`,
    ).run();
    db.prepare(
      `DELETE FROM ProjectExporter
        WHERE projectId IN (SELECT id FROM Project WHERE orderId LIKE 'E2E-%')`,
    ).run();
    db.prepare(`DELETE FROM Project WHERE orderId LIKE 'E2E-%'`).run();

    // An exporter is linked to projects through allocations, which go with
    // the exporter; the orders themselves are somebody else's to clean up.
    db.prepare(
      `DELETE FROM ProjectExporter
        WHERE exporterId IN (SELECT id FROM Exporter WHERE companyName LIKE 'E2E %')`,
    ).run();
    db.prepare(`DELETE FROM Exporter WHERE companyName LIKE 'E2E %'`).run();

    const result = db.prepare(`DELETE FROM Client WHERE name LIKE 'E2E %'`).run();
    return result.changes;
  } finally {
    db.close();
  }
}
