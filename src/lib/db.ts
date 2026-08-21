import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";

// Prisma 7 talks to the database through a driver adapter. Swapping to Postgres
// means installing @prisma/adapter-pg, swapping the two lines below, and
// changing the provider in schema.prisma — the query code is untouched.
const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
});

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

// Next's dev server re-evaluates modules on every hot reload; without this the
// connection count climbs until SQLite complains.
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/**
 * Every read must exclude soft-deleted rows. Spread this into `where` rather
 * than typing `deletedAt: null` by hand, so a forgotten filter is visible as a
 * missing spread rather than invisible as an absent key.
 */
export const notDeleted = { deletedAt: null } as const;


/**
 * The client handed to a `$transaction` callback. It exposes the same model
 * methods as `prisma` but is scoped to the transaction, so helpers that must
 * work either inside or outside one take `Db`.
 */
export type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
export type Db = typeof prisma | TransactionClient;
