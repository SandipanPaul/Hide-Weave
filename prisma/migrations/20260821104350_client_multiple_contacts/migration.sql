-- CreateTable
CREATE TABLE "ClientContact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "ClientContact_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Backfill: move each client's existing phone and email into the new
-- ClientContact table before the columns are dropped. Values are carried over
-- verbatim; multi-value cells are split on import, not here.
INSERT INTO "ClientContact" ("id", "clientId", "kind", "value", "position", "createdAt", "updatedAt")
SELECT lower(hex(randomblob(16))), "id", 'PHONE', trim("phone"), 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Client"
WHERE "phone" IS NOT NULL AND trim("phone") <> '';

INSERT INTO "ClientContact" ("id", "clientId", "kind", "value", "position", "createdAt", "updatedAt")
SELECT lower(hex(randomblob(16))), "id", 'EMAIL', trim("email"), 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Client"
WHERE "email" IS NOT NULL AND trim("email") <> '';

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Client" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "country" TEXT,
    "website" TEXT,
    "contactPerson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "fixedMonthly" BIGINT,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);
INSERT INTO "new_Client" ("address", "contactPerson", "country", "createdAt", "currency", "deletedAt", "fixedMonthly", "id", "name", "notes", "status", "updatedAt", "website") SELECT "address", "contactPerson", "country", "createdAt", "currency", "deletedAt", "fixedMonthly", "id", "name", "notes", "status", "updatedAt", "website" FROM "Client";
DROP TABLE "Client";
ALTER TABLE "new_Client" RENAME TO "Client";
CREATE INDEX "Client_deletedAt_idx" ON "Client"("deletedAt");
CREATE INDEX "Client_name_idx" ON "Client"("name");
CREATE INDEX "Client_status_idx" ON "Client"("status");
CREATE INDEX "Client_country_idx" ON "Client"("country");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ClientContact_clientId_idx" ON "ClientContact"("clientId");

-- CreateIndex
CREATE INDEX "ClientContact_kind_idx" ON "ClientContact"("kind");

-- CreateIndex
CREATE INDEX "ClientContact_value_idx" ON "ClientContact"("value");

-- CreateIndex
CREATE INDEX "ClientContact_deletedAt_idx" ON "ClientContact"("deletedAt");

