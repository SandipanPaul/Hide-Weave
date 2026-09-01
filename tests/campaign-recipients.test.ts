import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTempDatabase, type TempDatabase } from "./helpers/temp-database";
import { formData } from "./helpers/actions";

/**
 * Who a campaign actually gets written to, against a real database.
 *
 * This is the decision the whole feature turns on: clients resolved from their
 * current records, addresses typed by hand taken as given, and nobody written
 * to twice. Getting it wrong sends a duplicate to a real client, which cannot
 * be taken back — so it is exercised through the server action itself rather
 * than through the helpers it calls.
 */

let db: TempDatabase;

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
// `after` would otherwise start a real send loop; `redirect` throws by design.
vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  },
}));
vi.mock("@/lib/mail/settings", () => ({ isMailConfigured: async () => true }));

/** A client with one email address. */
function addClient(id: string, name: string, email: string, contactPerson: string | null) {
  const connection = db.open();
  connection.prepare(
    `INSERT INTO "Client" (id,name,contactPerson,status,currency,createdAt,updatedAt)
     VALUES (?,?,?,'ACTIVE','INR',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
  ).run(id, name, contactPerson);
  connection.prepare(
    `INSERT INTO "ClientContact" (id,clientId,kind,value,position,createdAt,updatedAt)
     VALUES (?,?,'EMAIL',?,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
  ).run(`${id}-c`, id, email);
  connection.close();
}

function recipientRows() {
  const connection = db.open();
  const rows = connection
    .prepare(`SELECT clientId, email, greeting, clientName FROM "CampaignRecipient" ORDER BY rowid`)
    .all() as { clientId: string | null; email: string; greeting: string; clientName: string }[];
  connection.close();
  return rows;
}

/** The campaign fields, as the compose screen submits them. */
function campaignForm(fields: {
  subject: string;
  body: string;
  clientIds?: string[];
  extraEmails?: string;
  cc?: string;
  files?: File[];
}) {
  const data = formData({
    subject: fields.subject,
    body: fields.body,
    clientId: fields.clientIds ?? [],
    extraEmails: fields.extraEmails ?? "",
    cc: fields.cc ?? "",
  });
  for (const file of fields.files ?? []) data.append("attachment", file);
  return data;
}

/** A file of a given size, so the size limits can be exercised for real. */
function makeFile(name: string, type: string, bytes: number) {
  return new File([new Uint8Array(bytes)], name, { type });
}

function attachmentRows() {
  const connection = db.open();
  const rows = connection
    .prepare(`SELECT id, filename, contentType, size, position FROM "CampaignAttachment" ORDER BY position`)
    .all() as { id: string; filename: string; contentType: string; size: number; position: number }[];
  connection.close();
  return rows;
}

/** Runs the action, swallowing the redirect it throws on success. */
async function create(data: FormData) {
  const { createCampaign } = await import("@/app/(app)/mail/actions");
  try {
    return await createCampaign(null, data);
  } catch (error) {
    if ((error as Error).message === "NEXT_REDIRECT") return { ok: true as const, data: null };
    throw error;
  }
}

beforeEach(() => {
  db = createTempDatabase("hw-recipients-");
});

afterEach(() => db.destroy());

describe("createCampaign recipients", () => {
  it("writes to chosen clients and typed addresses, clients first", async () => {
    addClient("c1", "Meridian Foods Ltd", "orders@meridian.example", "Daniel Okoro");

    const result = await create(
      campaignForm({
        subject: "Hello <name>",
        body: "Dear <name>,",
        clientIds: ["c1"],
        extraEmails: "Ravi Kumar <ravi@example.com>, info@example.com",
      }),
    );

    expect(result.ok).toBe(true);
    expect(recipientRows()).toEqual([
      {
        clientId: "c1",
        email: "orders@meridian.example",
        greeting: "Daniel",
        clientName: "Meridian Foods Ltd",
      },
      // Typed addresses have no client, and keep whatever label was given.
      { clientId: null, email: "ravi@example.com", greeting: "Ravi", clientName: "Ravi Kumar" },
      {
        clientId: null,
        email: "info@example.com",
        greeting: "Info",
        clientName: "info@example.com",
      },
    ]);
  });

  it("sends one copy when a typed address is also a chosen client's", async () => {
    addClient("c1", "Acme", "jane@acme.example", "Jane Doe");

    await create(
      campaignForm({
        subject: "Hi",
        body: "Dear <name>,",
        clientIds: ["c1"],
        // Same address, different case — the duplicate a person would actually
        // make, and the second copy is the one that looks careless.
        extraEmails: "JANE@ACME.EXAMPLE",
      }),
    );

    const rows = recipientRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ clientId: "c1", greeting: "Jane" });
  });

  it("sends to typed addresses with no client chosen at all", async () => {
    const result = await create(
      campaignForm({ subject: "Hi", body: "Dear <name>,", extraEmails: "solo@example.com" }),
    );

    expect(result.ok).toBe(true);
    expect(recipientRows()).toHaveLength(1);
  });

  it("refuses an address it cannot read rather than dropping it", async () => {
    const result = await create(
      campaignForm({ subject: "Hi", body: "Dear <name>,", extraEmails: "good@example.com, not-an-address" }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.extraEmails?.[0]).toContain("not-an-address");
    // Nothing queued: a mailing that would have skipped somebody is not sent.
    expect(recipientRows()).toEqual([]);
  });

  it("refuses a mailing with nobody to send to", async () => {
    const result = await create(campaignForm({ subject: "Hi", body: "Dear <name>," }));
    expect(result.ok).toBe(false);
    expect(recipientRows()).toEqual([]);
  });

  it("ignores a client id that has no email address any more", async () => {
    addClient("c1", "Acme", "jane@acme.example", "Jane");
    const connection = db.open();
    connection.prepare(`UPDATE "ClientContact" SET deletedAt = CURRENT_TIMESTAMP`).run();
    connection.close();

    const result = await create(
      campaignForm({ subject: "Hi", body: "Dear <name>,", clientIds: ["c1"], extraEmails: "x@example.com" }),
    );

    expect(result.ok).toBe(true);
    expect(recipientRows().map((row) => row.email)).toEqual(["x@example.com"]);
  });
});

describe("attachments", () => {
  it("stores the bytes, the name and the type, in the order chosen", async () => {
    const result = await create(
      campaignForm({
        subject: "Hi",
        body: "Dear <name>,",
        extraEmails: "a@example.com",
        files: [
          makeFile("catalogue.pdf", "application/pdf", 2048),
          makeFile("bag.jpg", "image/jpeg", 1024),
        ],
      }),
    );

    expect(result.ok).toBe(true);
    const rows = attachmentRows();
    expect(rows.map((row) => [row.filename, row.contentType, row.size])).toEqual([
      ["catalogue.pdf", "application/pdf", 2048],
      ["bag.jpg", "image/jpeg", 1024],
    ]);

    // The bytes are on disk under the row's id, not in the database.
    const stored = readFileSync(join(db.attachmentsPath, rows[0].id));
    expect(stored).toHaveLength(2048);
  });

  it("leaves nothing on disk when the mailing is refused", async () => {
    await create(
      campaignForm({
        subject: "Hi",
        body: "Dear <name>,",
        // No recipients at all, so the action refuses after the files are read.
        files: [makeFile("catalogue.pdf", "application/pdf", 512)],
      }),
    );

    // Orphan files would sit there forever with nothing referring to them.
    expect(existsSync(db.attachmentsPath) ? readdirSync(db.attachmentsPath) : []).toEqual([]);
  });

  it("removes the bytes when the mailing is deleted, keeping the record", async () => {
    await create(
      campaignForm({
        subject: "Hi",
        body: "Dear <name>,",
        extraEmails: "a@example.com",
        files: [makeFile("catalogue.pdf", "application/pdf", 512)],
      }),
    );
    const [row] = attachmentRows();
    expect(existsSync(join(db.attachmentsPath, row.id))).toBe(true);

    const { deleteCampaign } = await import("@/app/(app)/mail/actions");
    const connection = db.open();
    const campaignId = (connection.prepare(`SELECT id FROM "Campaign"`).get() as { id: string }).id;
    connection.close();
    await deleteCampaign(campaignId);

    expect(existsSync(join(db.attachmentsPath, row.id))).toBe(false);
    // The log still says what was attached, even though the file is gone.
    expect(attachmentRows()).toHaveLength(1);
  });

  it("refuses a file that is not a PDF or an image, and queues nothing", async () => {
    const result = await create(
      campaignForm({
        subject: "Hi",
        body: "Dear <name>,",
        extraEmails: "a@example.com",
        files: [makeFile("prices.xlsx", "application/vnd.ms-excel", 512)],
      }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.attachments?.[0]).toContain("prices.xlsx");
    // A mailing that would have gone out without its files is not sent at all.
    expect(recipientRows()).toEqual([]);
    expect(attachmentRows()).toEqual([]);
  });

  it("refuses a selection over the size limit", async () => {
    const result = await create(
      campaignForm({
        subject: "Hi",
        body: "Dear <name>,",
        extraEmails: "a@example.com",
        // Two files, each legal on its own, together over the mailing limit.
        files: [
          makeFile("a.pdf", "application/pdf", 9 * 1024 * 1024),
          makeFile("b.pdf", "application/pdf", 9 * 1024 * 1024),
        ],
      }),
    );

    expect(result.ok).toBe(false);
    expect(attachmentRows()).toEqual([]);
  });

  it("is happy with no attachments at all", async () => {
    const result = await create(campaignForm({ subject: "Hi", body: "Dear <name>,", extraEmails: "a@x.com" }));
    expect(result.ok).toBe(true);
    expect(attachmentRows()).toEqual([]);
  });
});

describe("cc", () => {
  it("stores the copy list on the mailing, normalised", async () => {
    await create(
      campaignForm({
        subject: "Hi",
        body: "Dear <name>,",
        extraEmails: "a@example.com",
        // Only the address is kept: a CC header carries no personalisation.
        cc: "Boss <boss@example.com>; second@example.com",
      }),
    );

    const connection = db.open();
    const row = connection.prepare(`SELECT cc FROM "Campaign"`).get() as { cc: string | null };
    connection.close();
    expect(row.cc).toBe("boss@example.com, second@example.com");
  });

  it("refuses a copy address it cannot read, and queues nothing", async () => {
    const result = await create(
      campaignForm({ subject: "Hi", body: "Dear <name>,", extraEmails: "a@example.com", cc: "nope" }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.cc?.[0]).toContain("nope");
    expect(recipientRows()).toEqual([]);
  });

  it("leaves cc null when nobody is copied", async () => {
    await create(campaignForm({ subject: "Hi", body: "Dear <name>,", extraEmails: "a@example.com" }));

    const connection = db.open();
    const row = connection.prepare(`SELECT cc FROM "Campaign"`).get() as { cc: string | null };
    connection.close();
    expect(row.cc).toBeNull();
  });
});
