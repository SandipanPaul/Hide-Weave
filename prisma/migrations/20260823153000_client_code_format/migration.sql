-- Re-issues client references in the chosen format: HWC00042 rather than
-- HW-0042. Three letters, five digits, no separator — one unbroken token, so
-- searching a mailbox for it cannot half-match something else.
--
-- Safe to rewrite in place because none of the old codes had left the app: they
-- were assigned by the backfill in the previous migration and have not been
-- quoted in any correspondence. Numbers are preserved, so a client keeps their
-- position in the sequence.
UPDATE "Client"
SET "code" = 'HWC' || substr('00000' || CAST(CAST(substr("code", 4) AS INTEGER) AS TEXT), -5, 5)
WHERE "code" LIKE 'HW-%';
