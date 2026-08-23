/*
  Warnings:

  - You are about to drop the `RetainerPeriod` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "RetainerPeriod";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "RetainerReceipt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "paidOn" DATETIME NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "RetainerReceipt_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "RetainerReceipt_clientId_idx" ON "RetainerReceipt"("clientId");

-- CreateIndex
CREATE INDEX "RetainerReceipt_deletedAt_idx" ON "RetainerReceipt"("deletedAt");

-- CreateIndex
CREATE INDEX "RetainerReceipt_paidOn_idx" ON "RetainerReceipt"("paidOn");

-- CreateIndex
CREATE INDEX "RetainerReceipt_currency_idx" ON "RetainerReceipt"("currency");
