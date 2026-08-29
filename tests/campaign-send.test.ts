import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTempDatabase, type TempDatabase } from "./helpers/temp-database";

/**
 * The send loop, run for real against a real SQLite file.
 *
 * Only the SMTP transport is faked. Everything else — the queries that pick the
 * next recipient, the status transitions, what survives a stop — is the code
 * that runs in production, because the properties worth testing here are the
 * ones that decide whether a client gets written to twice or not at all, and a
 * mocked database would prove none of them.
 */

let db: TempDatabase;
let sent: string[];
/** Addresses the fake transport should reject, and how. */
let rejections: Map<string, Error>;

/** Attaches a file to the seeded campaign: a row, and bytes on disk under its id. */
function attach(filename: string, contentType: string, bytes: number, position = 0) {
  const id = `a${position}`;
  const connection = db.open();
  connection.prepare(
    `INSERT INTO "CampaignAttachment" (id,campaignId,filename,contentType,size,position,createdAt)
     VALUES (?,'camp1',?,?,?,?,CURRENT_TIMESTAMP)`,
  ).run(id, filename, contentType, bytes, position);
  connection.close();
  mkdirSync(db.attachmentsPath, { recursive: true });
  writeFileSync(join(db.attachmentsPath, id), Buffer.alloc(bytes, 7));
  return id;
}

/** A client with a status, so the "mark as chasing" rule can be exercised. */
function addClient(id: string, status: string) {
  const connection = db.open();
  connection
    .prepare(
      `INSERT INTO "Client" (id,name,status,currency,createdAt,updatedAt)
       VALUES (?,?,?,'INR',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
    )
    .run(id, `Client ${id}`, status);
  connection.close();
}

function clientStatus(id: string): string | null {
  const connection = db.open();
  const row = connection.prepare(`SELECT status FROM "Client" WHERE id = ?`).get(id) as
    | { status: string }
    | undefined;
  connection.close();
  return row?.status ?? null;
}

function seed(recipients: { email: string; greeting: string; clientId?: string }[]) {
  const connection = db.open();
  connection.prepare(
    `INSERT INTO "Campaign" (id, subject, body, status, updatedAt)
     VALUES ('camp1', 'Hello <name>', 'Dear <name>, our new range is out.', 'QUEUED', CURRENT_TIMESTAMP)`,
  ).run();
  const insert = connection.prepare(
    `INSERT INTO "CampaignRecipient"
       (id, campaignId, clientId, email, greeting, clientName, status, createdAt, updatedAt)
     VALUES (?, 'camp1', ?, ?, ?, ?, 'PENDING', ?, CURRENT_TIMESTAMP)`,
  );
  recipients.forEach((recipient, index) => {
    // Explicit, increasing createdAt: the loop orders by it, and rows inserted
    // in the same second would otherwise tie.
    insert.run(
      `r${index}`,
      recipient.clientId ?? null,
      recipient.email,
      recipient.greeting,
      recipient.greeting,
      new Date(2026, 0, 1, 0, 0, index).toISOString(),
    );
  });
  connection.close();
}

function rows() {
  const connection = db.open();
  const recipients = connection
    .prepare(`SELECT id, email, status, error FROM "CampaignRecipient" ORDER BY createdAt`)
    .all() as { id: string; email: string; status: string; error: string | null }[];
  const campaign = connection.prepare(`SELECT status, error, finishedAt FROM "Campaign"`).get() as {
    status: string;
    error: string | null;
    finishedAt: string | null;
  };
  connection.close();
  return { recipients, campaign };
}

vi.mock("@/lib/mail/settings", () => ({
  mailConfig: async () => ({ user: "agent@example.com", password: "x", fromName: "Agent" }),
}));

/**
 * What the fake transport does with a message. Reset before each test.
 *
 * A single swappable implementation rather than `vi.doMock` per test: mock
 * registrations persist for the whole file, so a test that installed its own
 * transport silently changed every test after it — which is how a "failed"
 * send came to look like a successful one.
 */
let sendMailImpl: (message: Message) => Promise<unknown>;

type Message = {
  to: string;
  subject: string;
  text: string;
  cc?: string;
  attachments?: { filename: string; contentType: string; content: Buffer }[];
};

vi.mock("@/lib/mail/transport", () => ({
  mailTransport: () => ({ sendMail: (message: Message) => sendMailImpl(message) }),
}));

/** Imported fresh each test so it picks up this test's DATABASE_URL. */
async function loadRunner() {
  const { runCampaign } = await import("@/lib/mail/send");
  return runCampaign;
}

beforeEach(() => {
  db = createTempDatabase("hw-mail-");
  sent = [];
  rejections = new Map();
  sendMailImpl = async ({ to }) => {
    const rejection = rejections.get(to);
    if (rejection) throw rejection;
    sent.push(to);
    return { messageId: `<${to}>` };
  };
  // The loop paces itself a second between messages; fake timers would need
  // the loop driven by hand, so the delay is simply neutralised.
  vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void) => {
    fn();
    return 0 as unknown as NodeJS.Timeout;
  }) as typeof setTimeout);
});

afterEach(() => {
  vi.restoreAllMocks();
  db.destroy();
});

describe("runCampaign", () => {
  it("writes to every recipient once, in order, and completes", async () => {
    seed([
      { email: "a@example.com", greeting: "Ana" },
      { email: "b@example.com", greeting: "Ben" },
      { email: "c@example.com", greeting: "Cara" },
    ]);

    await (await loadRunner())("camp1");

    expect(sent).toEqual(["a@example.com", "b@example.com", "c@example.com"]);
    const { recipients, campaign } = rows();
    expect(recipients.map((r) => r.status)).toEqual(["SENT", "SENT", "SENT"]);
    expect(campaign.status).toBe("COMPLETED");
    expect(campaign.finishedAt).not.toBeNull();
  });

  it("records a rejected address as failed and keeps going", async () => {
    rejections.set("b@example.com", Object.assign(new Error("550 no such user"), {}));
    seed([
      { email: "a@example.com", greeting: "Ana" },
      { email: "b@example.com", greeting: "Ben" },
      { email: "c@example.com", greeting: "Cara" },
    ]);

    await (await loadRunner())("camp1");

    expect(sent).toEqual(["a@example.com", "c@example.com"]);
    const { recipients, campaign } = rows();
    expect(recipients.map((r) => r.status)).toEqual(["SENT", "FAILED", "SENT"]);
    expect(recipients[1].error).toContain("550");
    // One bad address does not make the campaign unfinished.
    expect(campaign.status).toBe("COMPLETED");
  });

  it("stops on a broken connection, leaving the rest to resume", async () => {
    rejections.set("b@example.com", Object.assign(new Error("Invalid login"), { code: "EAUTH" }));
    seed([
      { email: "a@example.com", greeting: "Ana" },
      { email: "b@example.com", greeting: "Ben" },
      { email: "c@example.com", greeting: "Cara" },
    ]);

    await (await loadRunner())("camp1");

    expect(sent).toEqual(["a@example.com"]);
    const { recipients, campaign } = rows();
    // b was never refused, only unreachable — so it is still owed a message.
    expect(recipients.map((r) => r.status)).toEqual(["SENT", "PENDING", "PENDING"]);
    expect(campaign.status).toBe("QUEUED");
    expect(campaign.error).toContain("Invalid login");
  });

  it("resumes without writing to anyone twice", async () => {
    rejections.set("b@example.com", Object.assign(new Error("down"), { code: "ECONNECTION" }));
    seed([
      { email: "a@example.com", greeting: "Ana" },
      { email: "b@example.com", greeting: "Ben" },
      { email: "c@example.com", greeting: "Cara" },
    ]);

    const runCampaign = await loadRunner();
    await runCampaign("camp1");
    rejections.clear();
    await runCampaign("camp1");

    // Ana is in the list once, despite the campaign having been run twice.
    expect(sent).toEqual(["a@example.com", "b@example.com", "c@example.com"]);
    expect(rows().campaign.status).toBe("COMPLETED");
  });

  it("stops when the campaign is removed mid-flight", async () => {
    seed([
      { email: "a@example.com", greeting: "Ana" },
      { email: "b@example.com", greeting: "Ben" },
    ]);
    // Deleted before the loop starts — the same check the loop makes each turn.
    const connection = db.open();
    connection.prepare(`UPDATE "Campaign" SET deletedAt = CURRENT_TIMESTAMP`).run();
    connection.close();

    await (await loadRunner())("camp1");

    expect(sent).toEqual([]);
    expect(rows().recipients.map((r) => r.status)).toEqual(["PENDING", "PENDING"]);
  });

  it("sends the attachments with every copy, in order", async () => {
    const sentAttachments: { filename: string; contentType: string; length: number }[][] = [];
    seed([
      { email: "a@example.com", greeting: "Ana" },
      { email: "b@example.com", greeting: "Ben" },
    ]);
    attach("catalogue.pdf", "application/pdf", 2048, 0);
    attach("bag.jpg", "image/jpeg", 1024, 1);

    sendMailImpl = async ({ attachments }) => {
      sentAttachments.push(
        (attachments ?? []).map((a) => ({
          filename: a.filename,
          contentType: a.contentType,
          length: a.content.length,
        })),
      );
      return {};
    };

    await (await loadRunner())("camp1");

    const expected = [
      { filename: "catalogue.pdf", contentType: "application/pdf", length: 2048 },
      { filename: "bag.jpg", contentType: "image/jpeg", length: 1024 },
    ];
    // Both recipients, both files, bytes intact through the database round trip.
    expect(sentAttachments).toEqual([expected, expected]);
  });

  it("sends no attachments key when there is nothing attached", async () => {
    const keys: boolean[] = [];
    seed([{ email: "a@example.com", greeting: "Ana" }]);

    sendMailImpl = async (message) => {
      keys.push("attachments" in message);
      return {};
    };

    await (await loadRunner())("camp1");
    expect(keys).toEqual([false]);
  });

  it("sends nothing when an attachment is missing from disk", async () => {
    seed([{ email: "a@example.com", greeting: "Ana" }]);
    const id = attach("catalogue.pdf", "application/pdf", 512, 0);
    // What a restored backup looks like: the record is there, the file is not.
    unlinkSync(join(db.attachmentsPath, id));

    await (await loadRunner())("camp1");

    // Sending a mail written around a catalogue, without the catalogue, is
    // worse than not sending it — and it cannot be taken back.
    expect(sent).toEqual([]);
    const { recipients, campaign } = rows();
    expect(recipients[0].status).toBe("PENDING");
    expect(campaign.error).toContain("catalogue.pdf");
  });

  it("substitutes each recipient's own name", async () => {
    const bodies: string[] = [];
    seed([
      { email: "a@example.com", greeting: "Ana" },
      { email: "b@example.com", greeting: "Meridian Foods Ltd" },
    ]);

    sendMailImpl = async ({ text, subject }) => {
      bodies.push(`${subject} | ${text}`);
      return {};
    };

    await (await loadRunner())("camp1");

    expect(bodies).toEqual([
      "Hello Ana | Dear Ana, our new range is out.",
      "Hello Meridian Foods Ltd | Dear Meridian Foods Ltd, our new range is out.",
    ]);
  });
});

describe("marking clients as chasing", () => {
  it("moves an inactive client to chasing once the mail has gone", async () => {
    addClient("c1", "INACTIVE");
    seed([{ email: "a@example.com", greeting: "Ana", clientId: "c1" }]);

    await (await loadRunner())("camp1");

    expect(clientStatus("c1")).toBe("CHASING");
  });

  it("leaves an active client alone", async () => {
    addClient("c1", "ACTIVE");
    seed([{ email: "a@example.com", greeting: "Ana", clientId: "c1" }]);

    await (await loadRunner())("camp1");

    // CHASING means "being pursued, has not ordered yet". A client with live
    // orders is not that, and demoting them would change what the Clients tab
    // says at a glance.
    expect(clientStatus("c1")).toBe("ACTIVE");
  });

  it("does not change anyone whose message failed", async () => {
    addClient("c1", "INACTIVE");
    rejections.set("a@example.com", new Error("550 no such user"));
    seed([{ email: "a@example.com", greeting: "Ana", clientId: "c1" }]);

    await (await loadRunner())("camp1");

    // Nothing reached them, so nothing is being chased.
    expect(clientStatus("c1")).toBe("INACTIVE");
  });

  it("ignores a typed-in address, which has no client behind it", async () => {
    seed([{ email: "stranger@example.com", greeting: "Stranger" }]);
    await expect((await loadRunner())("camp1")).resolves.toBeUndefined();
    expect(sent).toEqual(["stranger@example.com"]);
  });
});

describe("cc", () => {
  it("copies the same addresses on every message", async () => {
    const ccs: (string | undefined)[] = [];
    seed([
      { email: "a@example.com", greeting: "Ana" },
      { email: "b@example.com", greeting: "Ben" },
    ]);
    const connection = db.open();
    connection.prepare(`UPDATE "Campaign" SET cc = 'boss@example.com' WHERE id = 'camp1'`).run();
    connection.close();

    sendMailImpl = async ({ cc }) => {
      ccs.push(cc);
      return {};
    };

    await (await loadRunner())("camp1");
    expect(ccs).toEqual(["boss@example.com", "boss@example.com"]);
  });

  it("sends no cc header when nobody is copied", async () => {
    const keys: boolean[] = [];
    seed([{ email: "a@example.com", greeting: "Ana" }]);

    sendMailImpl = async (message) => {
      keys.push("cc" in message);
      return {};
    };

    await (await loadRunner())("camp1");
    expect(keys).toEqual([false]);
  });
});
