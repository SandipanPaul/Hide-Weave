-- AlterTable
ALTER TABLE "Client" ADD COLUMN "country" TEXT;

-- CreateIndex
CREATE INDEX "Client_country_idx" ON "Client"("country");
