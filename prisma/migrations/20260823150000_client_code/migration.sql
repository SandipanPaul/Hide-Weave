-- A short, human-readable reference per client, for quoting in correspondence.
--
-- Added as a nullable column plus a unique index rather than as NOT NULL:
-- making it NOT NULL would mean rebuilding Client, which half the schema holds
-- foreign keys into, and there is nothing to gain from that risk. Existing rows
-- are backfilled below and every write sets one.
ALTER TABLE "Client" ADD COLUMN "code" TEXT;

-- Numbered by when each client was first added, so the sequence matches the
-- order they joined rather than an arbitrary row order. `id` breaks ties so the
-- result is deterministic if two rows share a timestamp.
UPDATE "Client"
SET "code" = (
    SELECT 'HW-' || substr('0000' || numbered.rn, -4, 4)
    FROM (
        SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt", "id") AS rn
        FROM "Client"
    ) AS numbered
    WHERE numbered."id" = "Client"."id"
);

CREATE UNIQUE INDEX "Client_code_key" ON "Client"("code");
