import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTempDatabase, type TempDatabase } from "./helpers/temp-database";

/**
 * Nothing soft-deleted may ever appear in a list.
 *
 * This app never really deletes: every table has `deletedAt`, and every read is
 * supposed to spread `notDeleted` into its `where`. That is a convention, and
 * conventions are exactly what a new query forgets — the failure being silent
 * and specific, a removed client quietly reappearing in one list and not the
 * others.
 *
 * One test per list, each asserting the same thing: two rows in, one deleted,
 * one comes back.
 */

let db: TempDatabase;

const params = { q: "", sort: "", dir: "asc" as const, page: 1, filters: {} };

beforeEach(() => {
  db = createTempDatabase("hw-softdelete-");
});

afterEach(() => db.destroy());

/** Inserts a live row and a soft-deleted one, and returns their ids. */
function seedPair(
  table: string,
  columns: string,
  values: string,
  extra: (id: string, deleted: boolean) => void = () => {},
) {
  const connection = db.open();
  for (const [id, deletedAt] of [
    ["live", "NULL"],
    ["gone", "CURRENT_TIMESTAMP"],
  ]) {
    connection
      .prepare(
        `INSERT INTO "${table}" (id, ${columns}, createdAt, updatedAt, deletedAt)
         VALUES ('${id}', ${values.replace(/@id/g, id)}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ${deletedAt})`,
      )
      .run();
    extra(id, deletedAt !== "NULL");
  }
  connection.close();
}

describe("deleted rows stay out of the lists", () => {
  it("clients", async () => {
    seedPair("Client", "name, status, currency", `'Client @id', 'ACTIVE', 'INR'`);

    const { getClientsPage } = await import("@/lib/clients/queries");
    const { rows } = await getClientsPage({ ...params, sort: "name" });

    expect(rows.map((row) => row.name)).toEqual(["Client live"]);
  });

  it("suppliers", async () => {
    seedPair("Supplier", "companyName, types", `'Supplier @id', ''`);

    const { getSuppliersPage } = await import("@/lib/suppliers/queries");
    const { rows } = await getSuppliersPage({ ...params, sort: "companyName" });

    expect(rows.map((row) => row.companyName)).toEqual(["Supplier live"]);
  });

  it("projects", async () => {
    const connection = db.open();
    connection
      .prepare(
        `INSERT INTO "Client" (id,name,status,currency,createdAt,updatedAt)
         VALUES ('c1','Acme','ACTIVE','INR',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
      )
      .run();
    connection.close();

    seedPair(
      "Project",
      "clientId, product, orderId, quantity, unit, orderValue, commissionPercentage, currency, status, orderDate",
      `'c1', 'Bags @id', 'ORD@id', 100, 'pcs', 100000, 2.5, 'INR', 'QUOTED', CURRENT_TIMESTAMP`,
    );

    const { getProjectsPage } = await import("@/lib/projects/queries");
    const { rows } = await getProjectsPage({ ...params, sort: "orderDate", dir: "desc" });

    expect(rows.map((row) => row.product)).toEqual(["Bags live"]);
  });

  it("mailings", async () => {
    const connection = db.open();
    for (const [id, deletedAt] of [
      ["live", "NULL"],
      ["gone", "CURRENT_TIMESTAMP"],
    ]) {
      connection
        .prepare(
          `INSERT INTO "Campaign" (id, subject, body, status, createdAt, updatedAt, deletedAt)
           VALUES ('${id}', 'Subject ${id}', 'Body', 'COMPLETED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ${deletedAt})`,
        )
        .run();
    }
    connection.close();

    const { getCampaigns } = await import("@/lib/mail/queries");
    expect((await getCampaigns()).map((c) => c.subject)).toEqual(["Subject live"]);
  });

  it("a client's own contacts", async () => {
    const connection = db.open();
    connection
      .prepare(
        `INSERT INTO "Client" (id,name,status,currency,createdAt,updatedAt)
         VALUES ('c1','Acme','ACTIVE','INR',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
      )
      .run();
    for (const [id, deletedAt] of [
      ["live", "NULL"],
      ["gone", "CURRENT_TIMESTAMP"],
    ]) {
      connection
        .prepare(
          `INSERT INTO "ClientContact" (id,clientId,kind,value,position,createdAt,updatedAt,deletedAt)
           VALUES ('${id}','c1','EMAIL','${id}@example.com',0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,${deletedAt})`,
        )
        .run();
    }
    connection.close();

    const { getClientsPage } = await import("@/lib/clients/queries");
    const { rows } = await getClientsPage({ ...params, sort: "name" });

    // A removed address must not come back on the client it was removed from.
    expect(rows[0].emails).toEqual(["live@example.com"]);
  });
});
