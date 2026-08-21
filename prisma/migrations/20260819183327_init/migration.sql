-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
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

-- CreateTable
CREATE TABLE "ClientSampling" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "scheduledDate" DATETIME NOT NULL,
    "product" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "ClientSampling_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Exporter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyName" TEXT NOT NULL,
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

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "exporterId" TEXT,
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
    CONSTRAINT "Project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Project_exporterId_fkey" FOREIGN KEY ("exporterId") REFERENCES "Exporter" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "paidOn" DATETIME NOT NULL,
    "method" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Payment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Client_deletedAt_idx" ON "Client"("deletedAt");

-- CreateIndex
CREATE INDEX "Client_name_idx" ON "Client"("name");

-- CreateIndex
CREATE INDEX "Client_status_idx" ON "Client"("status");

-- CreateIndex
CREATE INDEX "ClientSampling_clientId_idx" ON "ClientSampling"("clientId");

-- CreateIndex
CREATE INDEX "ClientSampling_deletedAt_idx" ON "ClientSampling"("deletedAt");

-- CreateIndex
CREATE INDEX "ClientSampling_scheduledDate_idx" ON "ClientSampling"("scheduledDate");

-- CreateIndex
CREATE INDEX "ClientSampling_status_idx" ON "ClientSampling"("status");

-- CreateIndex
CREATE INDEX "Exporter_deletedAt_idx" ON "Exporter"("deletedAt");

-- CreateIndex
CREATE INDEX "Exporter_companyName_idx" ON "Exporter"("companyName");

-- CreateIndex
CREATE INDEX "Project_clientId_idx" ON "Project"("clientId");

-- CreateIndex
CREATE INDEX "Project_exporterId_idx" ON "Project"("exporterId");

-- CreateIndex
CREATE INDEX "Project_deletedAt_idx" ON "Project"("deletedAt");

-- CreateIndex
CREATE INDEX "Project_orderId_idx" ON "Project"("orderId");

-- CreateIndex
CREATE INDEX "Project_status_idx" ON "Project"("status");

-- CreateIndex
CREATE INDEX "Project_orderDate_idx" ON "Project"("orderDate");

-- CreateIndex
CREATE INDEX "Project_currency_idx" ON "Project"("currency");

-- CreateIndex
CREATE INDEX "Payment_projectId_idx" ON "Payment"("projectId");

-- CreateIndex
CREATE INDEX "Payment_deletedAt_idx" ON "Payment"("deletedAt");

-- CreateIndex
CREATE INDEX "Payment_paidOn_idx" ON "Payment"("paidOn");
