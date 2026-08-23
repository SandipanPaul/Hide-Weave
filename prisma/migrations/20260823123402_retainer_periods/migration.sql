-- CreateTable
CREATE TABLE "RetainerPeriod" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "startedOn" DATETIME NOT NULL,
    "endedOn" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "RetainerPeriod_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "RetainerPeriod_clientId_idx" ON "RetainerPeriod"("clientId");

-- CreateIndex
CREATE INDEX "RetainerPeriod_deletedAt_idx" ON "RetainerPeriod"("deletedAt");

-- CreateIndex
CREATE INDEX "RetainerPeriod_startedOn_idx" ON "RetainerPeriod"("startedOn");

-- CreateIndex
CREATE INDEX "RetainerPeriod_currency_idx" ON "RetainerPeriod"("currency");
