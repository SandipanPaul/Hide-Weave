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
    // Order references are issued by the app, so a test project cannot be
    // recognised by its reference — it is found through the E2E client it
    // belongs to, which is what the tests actually name.
    db.prepare(
      `DELETE FROM Payment
        WHERE projectId IN (SELECT id FROM Project WHERE clientId IN (SELECT id FROM Client WHERE name LIKE 'E2E %'))`,
    ).run();
    db.prepare(
      `DELETE FROM Expense
        WHERE projectId IN (SELECT id FROM Project WHERE clientId IN (SELECT id FROM Client WHERE name LIKE 'E2E %'))`,
    ).run();
    db.prepare(
      `DELETE FROM ProjectSupplier
        WHERE projectId IN (SELECT id FROM Project WHERE clientId IN (SELECT id FROM Client WHERE name LIKE 'E2E %'))`,
    ).run();
    db.prepare(
      `DELETE FROM Project
        WHERE clientId IN (SELECT id FROM Client WHERE name LIKE 'E2E %')`,
    ).run();

    // General expenses and retainers have no project to be found through, so
    // they are matched on the client the tests attach them to, or on the
    // description they are given.
    db.prepare(`DELETE FROM Expense WHERE description LIKE 'E2E %'`).run();
    db.prepare(
      `DELETE FROM Expense
        WHERE clientId IN (SELECT id FROM Client WHERE name LIKE 'E2E %')`,
    ).run();
    db.prepare(
      `DELETE FROM RetainerReceipt
        WHERE clientId IN (SELECT id FROM Client WHERE name LIKE 'E2E %')`,
    ).run();

    // An supplier is linked to projects through allocations, which go with
    // the supplier; the orders themselves are somebody else's to clean up.
    db.prepare(
      `DELETE FROM ProjectSupplier
        WHERE supplierId IN (SELECT id FROM Supplier WHERE companyName LIKE 'E2E %')`,
    ).run();
    db.prepare(`DELETE FROM Supplier WHERE companyName LIKE 'E2E %'`).run();

    const result = db.prepare(`DELETE FROM Client WHERE name LIKE 'E2E %'`).run();
    return result.changes;
  } finally {
    db.close();
  }
}
