-- Exporters become Suppliers, and gain a classification.
--
-- "Exporter" was always too narrow: what we source from is tanneries, exporters,
-- OEM factories and private label makers, and a great many Indian leather
-- companies are several of those at once. `types` is therefore a list, not a
-- single value.
--
-- Tables are rebuilt rather than renamed so the new foreign keys and indexes
-- carry the names Prisma would have generated, and existing rows are carried
-- across unchanged.
PRAGMA foreign_keys=OFF;

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyName" TEXT NOT NULL,
    "types" TEXT NOT NULL DEFAULT '',
    "website" TEXT,
    "contactPerson" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "sourceUrl" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);

INSERT INTO "Supplier" ("id","companyName","website","contactPerson","email","phone","address","sourceUrl","notes","createdAt","updatedAt","deletedAt")
SELECT "id","companyName","website","contactPerson","email","phone","address","sourceUrl","notes","createdAt","updatedAt","deletedAt" FROM "Exporter";

DROP TABLE "Exporter";

-- CreateTable
CREATE TABLE "ProjectSupplier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "ProjectSupplier_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectSupplier_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "ProjectSupplier" ("id","projectId","supplierId","quantity","position","notes","createdAt","updatedAt","deletedAt")
SELECT "id","projectId","exporterId","quantity","position","notes","createdAt","updatedAt","deletedAt" FROM "ProjectExporter";

DROP TABLE "ProjectExporter";

-- CreateIndex
CREATE INDEX "Supplier_deletedAt_idx" ON "Supplier"("deletedAt");
CREATE INDEX "Supplier_companyName_idx" ON "Supplier"("companyName");
CREATE INDEX "Supplier_types_idx" ON "Supplier"("types");
CREATE INDEX "ProjectSupplier_projectId_idx" ON "ProjectSupplier"("projectId");
CREATE INDEX "ProjectSupplier_supplierId_idx" ON "ProjectSupplier"("supplierId");
CREATE INDEX "ProjectSupplier_deletedAt_idx" ON "ProjectSupplier"("deletedAt");

PRAGMA foreign_keys=ON;
