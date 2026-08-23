-- Retainer receipts, and expenses attached to a client rather than an order.
--
-- Payment needs a full table rebuild: SQLite cannot relax a NOT NULL column,
-- and `projectId` has to become optional so a retainer — which has no order
-- behind it — can be recorded at all.
--
-- The rebuild is also where existing rows get their `currency`. Until now a
-- payment inherited it from its project; every row is copied with that same
-- value, so nothing is reinterpreted.
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT,
    "clientId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'COMMISSION',
    "amount" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "paidOn" DATETIME NOT NULL,
    "method" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Payment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Payment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Every existing payment settles commission on an order, so all of them are
-- COMMISSION with their project's currency and no clientId: the client is
-- reached through the project, and duplicating it here would let the two drift.
INSERT INTO "new_Payment" ("id", "projectId", "clientId", "kind", "amount", "currency", "paidOn", "method", "notes", "createdAt", "updatedAt", "deletedAt")
SELECT
    "Payment"."id",
    "Payment"."projectId",
    NULL,
    'COMMISSION',
    "Payment"."amount",
    "Project"."currency",
    "Payment"."paidOn",
    "Payment"."method",
    "Payment"."notes",
    "Payment"."createdAt",
    "Payment"."updatedAt",
    "Payment"."deletedAt"
FROM "Payment"
JOIN "Project" ON "Project"."id" = "Payment"."projectId";

DROP TABLE "Payment";
ALTER TABLE "new_Payment" RENAME TO "Payment";

CREATE INDEX "Payment_projectId_idx" ON "Payment"("projectId");
CREATE INDEX "Payment_clientId_idx" ON "Payment"("clientId");
CREATE INDEX "Payment_kind_idx" ON "Payment"("kind");
CREATE INDEX "Payment_deletedAt_idx" ON "Payment"("deletedAt");
CREATE INDEX "Payment_paidOn_idx" ON "Payment"("paidOn");
CREATE INDEX "Payment_currency_idx" ON "Payment"("currency");

-- Expense only gains a nullable column, which SQLite can add in place.
ALTER TABLE "Expense" ADD COLUMN "clientId" TEXT REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Expense_clientId_idx" ON "Expense"("clientId");

PRAGMA foreign_keys=ON;
