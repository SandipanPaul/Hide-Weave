-- Retainers became a schedule on the client (see RetainerPeriod), so a payment
-- is once again always a commission receipt against one order.
--
-- This undoes the nullable `projectId` and the `kind` and `clientId` columns
-- added when retainers were briefly modelled as receipts. Nothing ever wrote a
-- row that used them — every payment has a project and kind 'COMMISSION' — so
-- no data is lost. `currency` is kept: filtering payments by currency without
-- joining Project is worth the column.
--
-- A full rebuild again, because SQLite cannot make a column NOT NULL in place.
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "paidOn" DATETIME NOT NULL,
    "method" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Payment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- The WHERE is a guard, not a filter: there should be no such rows, and if one
-- somehow existed it must not silently become a NOT NULL violation.
INSERT INTO "new_Payment" ("id", "projectId", "amount", "currency", "paidOn", "method", "notes", "createdAt", "updatedAt", "deletedAt")
SELECT "id", "projectId", "amount", "currency", "paidOn", "method", "notes", "createdAt", "updatedAt", "deletedAt"
FROM "Payment"
WHERE "projectId" IS NOT NULL;

DROP TABLE "Payment";
ALTER TABLE "new_Payment" RENAME TO "Payment";

CREATE INDEX "Payment_projectId_idx" ON "Payment"("projectId");
CREATE INDEX "Payment_deletedAt_idx" ON "Payment"("deletedAt");
CREATE INDEX "Payment_paidOn_idx" ON "Payment"("paidOn");
CREATE INDEX "Payment_currency_idx" ON "Payment"("currency");

PRAGMA foreign_keys=ON;
