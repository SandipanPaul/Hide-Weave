-- Order references are now issued by the app rather than typed, in the form
-- ORD00000042. This converts references already in the old ORD-#### shape so
-- the sequence continues from them rather than restarting and colliding.
--
-- Deliberately narrow: only values matching ORD- followed by digits are
-- touched. Anything else in this column was typed by hand — a client's own PO
-- number, most likely — and rewriting that would destroy a real reference.
-- Unrecognised values are simply ignored when the next number is worked out.
UPDATE "Project"
SET "orderId" = 'ORD' || substr('00000000' || CAST(substr("orderId", 5) AS INTEGER), -8, 8)
WHERE "orderId" GLOB 'ORD-[0-9]*'
  AND CAST(substr("orderId", 5) AS INTEGER) > 0;
