import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTempDatabase, type TempDatabase } from "./helpers/temp-database";
import { expectRenderedKeys, formData } from "./helpers/actions";

/**
 * Rejected client saves, and where the message lands.
 *
 * A failure reported against a field the form does not render is worse than no
 * validation at all: the save silently does nothing and the user is left
 * pressing a dead button. These assert the *key*, not just that it failed.
 */

let db: TempDatabase;

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: () => {} }));

/** The field names the client form actually reads — clientInputSchema's keys. */
const RENDERED_FIELDS = [
  "name", "address", "country", "phones", "emails", "website",
  "contactPerson", "status", "fixedMonthly", "currency", "notes",
] as const;

async function createClient(fields: Record<string, string | string[]>) {
  const { createClient } = await import("@/app/(app)/clients/actions");
  return createClient(null, formData({ name: "Acme", status: "ACTIVE", currency: "INR", ...fields }));
}

beforeEach(() => {
  db = createTempDatabase("hw-clients-");
});

afterEach(() => db.destroy());

describe("email conflicts", () => {
  it("reports a clash on a field the form renders", async () => {
    await createClient({ name: "Shiro Matsushita", email: "phsfy209@example.com" });
    const second = await createClient({ name: "Matsushita Luggage", email: "s_matsushita@example.com" });
    expect(second.ok).toBe(true);

    // Adding the second company's address to the first — the real case that
    // failed in production with no message at all.
    const { updateClient } = await import("@/app/(app)/clients/actions");
    const connection = db.open();
    const id = (connection.prepare(`SELECT id FROM "Client" WHERE name = 'Shiro Matsushita'`).get() as { id: string }).id;
    connection.close();

    const result = await updateClient(
      id,
      null,
      formData({
        name: "Shiro Matsushita",
        status: "ACTIVE",
        currency: "INR",
        email: ["phsfy209@example.com", "s_matsushita@example.com"],
      }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.fieldErrors)).toContain("emails");
      // The heart of it: every key must be one the form can display.
      expectRenderedKeys(result, RENDERED_FIELDS);
    }
  });

  it("reports a duplicate name against the name field", async () => {
    await createClient({ name: "Oakhide", email: "a@example.com" });
    const clash = await createClient({ name: "Oakhide", email: "b@example.com" });

    expect(clash.ok).toBe(false);
    if (!clash.ok) expect(Object.keys(clash.fieldErrors)).toEqual(["name"]);
  });

  it("lets an unrelated second address through", async () => {
    const first = await createClient({ name: "Oakhide", email: "a@example.com" });
    expect(first.ok).toBe(true);

    const { updateClient } = await import("@/app/(app)/clients/actions");
    const connection = db.open();
    const id = (connection.prepare(`SELECT id FROM "Client"`).get() as { id: string }).id;
    connection.close();

    const result = await updateClient(
      id,
      null,
      formData({
        name: "Oakhide",
        status: "ACTIVE",
        currency: "INR",
        email: ["a@example.com", "second@example.com"],
      }),
    );

    expect(result.ok).toBe(true);
    const connection2 = db.open();
    const count = (connection2.prepare(`SELECT COUNT(*) c FROM "ClientContact" WHERE kind='EMAIL' AND deletedAt IS NULL`).get() as { c: number }).c;
    connection2.close();
    expect(count).toBe(2);
  });
});
