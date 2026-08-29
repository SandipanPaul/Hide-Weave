-- Attachment bytes move from the database to disk, beside the database file.
--
-- Keeping them here copied every attached megabyte into all fourteen retained
-- backups. The row stays as the record of the file — name, type, size — and its
-- `id` is the filename on disk. See src/lib/mail/attachment-store.ts.
--
-- SQLite 3.35+ supports dropping a column outright, so no table rebuild is
-- needed. Any bytes already stored are discarded with the column; the mail they
-- belonged to has already been sent.
ALTER TABLE "CampaignAttachment" DROP COLUMN "content";
