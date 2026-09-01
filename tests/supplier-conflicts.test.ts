import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTempDatabase, type TempDatabase } from "./helpers/temp-database";
import { expectRenderedKeys, formData } from "./helpers/actions";

/**
 * Supplier duplicate rules, and where a refusal is reported.
 *
 * The same pair of concerns as client-conflicts.test.ts, for the same reason:
 * a rejection filed against a field the form does not render makes the save
 * silently do nothing, which is exactly how a real bug reached production.
 * These assert the key, not just the failure.
 */

let db: TempDatabase;

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

/** The keys the supplier form reads — supplierInputSchema's fields. */
const RENDERED_FIELDS = [
  "companyName",
  "types",
  "website",
  "contactPerson",
  "email",
  "phone",
  "address",
  "sourceUrl",
  "notes",
] as const;

async function create(fields: Record<string, string | string[]>) {
  const { createSupplier } = await import("@/app/(app)/suppliers/actions");
  return createSupplier(null, formData(fields));
}


beforeEach(() => {
  db = createTempDatabase("hw-suppliers-");
});

afterEach(() => db.destroy());

describe("createSupplier", () => {
  it("saves a supplier with several types", async () => {
    const result = await create({
      companyName: "Chennai Hides",
      types: ["TANNERY", "EXPORTER"],
      website: "chennaihides.com",
    });

    expect(result.ok).toBe(true);
    const connection = db.open();
    const row = connection.prepare(`SELECT types, website FROM "Supplier"`).get() as {
      types: string;
      website: string;
    };
    connection.close();
    expect(row.types).toBe("TANNERY,EXPORTER");
    // The website is canonicalised on the way in, which is what makes the
    // duplicate check below work on a bare domain.
    expect(row.website).toBe("https://chennaihides.com");
  });

  it("stores no types when none were chosen", async () => {
    // Unclassified is a legitimate state, not a validation failure.
    expect((await create({ companyName: "Unknown Works" })).ok).toBe(true);
  });

  it("ignores a type the app does not know", async () => {
    const result = await create({ companyName: "Odd Co", types: ["TANNERY", "WHOLESALER"] });
    expect(result.ok).toBe(true);

    const connection = db.open();
    const { types } = connection.prepare(`SELECT types FROM "Supplier"`).get() as { types: string };
    connection.close();
    // A stale checkbox from an older page must not block a save.
    expect(types).toBe("TANNERY");
  });

  it("refuses a duplicate name, whatever the case, on the name field", async () => {
    await create({ companyName: "Chennai Hides" });
    const clash = await create({ companyName: "  chennai hides  " });

    expect(clash.ok).toBe(false);
    if (!clash.ok) {
      expect(Object.keys(clash.fieldErrors)).toEqual(["companyName"]);
      expectRenderedKeys(clash, RENDERED_FIELDS);
    }
  });

  it("refuses a duplicate website on the website field, naming who has it", async () => {
    await create({ companyName: "Chennai Hides", website: "https://www.chennaihides.com/" });
    const clash = await create({ companyName: "Different Name", website: "chennaihides.com" });

    expect(clash.ok).toBe(false);
    if (!clash.ok) {
      expect(clash.fieldErrors.website?.[0]).toContain("Chennai Hides");
      expectRenderedKeys(clash, RENDERED_FIELDS);
    }
  });

  it("does not treat two suppliers without a website as duplicates", async () => {
    await create({ companyName: "One" });
    // An empty key matching everything would make the second supplier
    // impossible to add.
    expect((await create({ companyName: "Two" })).ok).toBe(true);
  });
});

describe("updateSupplier", () => {
  it("does not report a supplier as a duplicate of itself", async () => {
    await create({ companyName: "Chennai Hides", website: "chennaihides.com" });
    const connection = db.open();
    const id = (connection.prepare(`SELECT id FROM "Supplier"`).get() as { id: string }).id;
    connection.close();

    const { updateSupplier } = await import("@/app/(app)/suppliers/actions");
    const result = await updateSupplier(
      id,
      null,
      formData({ companyName: "Chennai Hides", website: "chennaihides.com", types: "TANNERY" }),
    );

    // Saving without changing the name must not fail, or nothing can be edited.
    expect(result.ok).toBe(true);
  });

  it("still refuses another supplier's name", async () => {
    await create({ companyName: "Chennai Hides" });
    await create({ companyName: "Kanpur Leathers" });

    const connection = db.open();
    const id = (connection.prepare(`SELECT id FROM "Supplier" WHERE companyName = 'Kanpur Leathers'`).get() as { id: string }).id;
    connection.close();

    const { updateSupplier } = await import("@/app/(app)/suppliers/actions");
    const result = await updateSupplier(id, null, formData({ companyName: "Chennai Hides" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expectRenderedKeys(result, RENDERED_FIELDS);
  });
});
