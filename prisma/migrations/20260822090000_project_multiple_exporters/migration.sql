-- A project can be split across several exporters, each making part of the
-- quantity. Written by hand rather than generated, because the existing
-- Project.exporterId values have to survive the change: each becomes one
-- allocation for the whole quantity, which is what a single exporter meant.

-- CreateTable
CREATE TABLE "ProjectExporter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "exporterId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "ProjectExporter_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectExporter_exporterId_fkey" FOREIGN KEY ("exporterId") REFERENCES "Exporter" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ProjectExporter_projectId_idx" ON "ProjectExporter"("projectId");
CREATE INDEX "ProjectExporter_exporterId_idx" ON "ProjectExporter"("exporterId");
CREATE INDEX "ProjectExporter_deletedAt_idx" ON "ProjectExporter"("deletedAt");

-- Carry every existing single exporter across as one allocation covering the
-- whole order. Done before the column goes, or the link is lost.
INSERT INTO "ProjectExporter" ("id", "projectId", "exporterId", "quantity", "position", "createdAt", "updatedAt")
SELECT
    lower(hex(randomblob(12))),
    p."id",
    p."exporterId",
    p."quantity",
    0,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Project" p
WHERE p."exporterId" IS NOT NULL;

-- Drop Project.exporterId by rebuilding the table.
--
-- `ALTER TABLE ... DROP COLUMN` refuses here: SQLite will not drop a column
-- that a FOREIGN KEY constraint names, and Project_exporterId_fkey names this
-- one. Rebuilding is the supported way, and is what Prisma generates for
-- SQLite itself.
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'pcs',
    "orderValue" BIGINT NOT NULL,
    "commissionPercentage" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" TEXT NOT NULL DEFAULT 'QUOTED',
    "orderDate" DATETIME NOT NULL,
    "expectedDelivery" DATETIME,
    "actualDelivery" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_Project" ("id", "clientId", "product", "orderId", "quantity", "unit", "orderValue", "commissionPercentage", "currency", "status", "orderDate", "expectedDelivery", "actualDelivery", "notes", "createdAt", "updatedAt", "deletedAt")
SELECT "id", "clientId", "product", "orderId", "quantity", "unit", "orderValue", "commissionPercentage", "currency", "status", "orderDate", "expectedDelivery", "actualDelivery", "notes", "createdAt", "updatedAt", "deletedAt"
FROM "Project";

DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";

CREATE INDEX "Project_clientId_idx" ON "Project"("clientId");
CREATE INDEX "Project_deletedAt_idx" ON "Project"("deletedAt");
CREATE INDEX "Project_orderId_idx" ON "Project"("orderId");
CREATE INDEX "Project_status_idx" ON "Project"("status");
CREATE INDEX "Project_orderDate_idx" ON "Project"("orderDate");
CREATE INDEX "Project_currency_idx" ON "Project"("currency");

PRAGMA foreign_keys=ON;
