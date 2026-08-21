import path from "node:path";
import { defineConfig, env } from "prisma/config";
import "dotenv/config";

// Prisma 7 reads datasource + migration config from here rather than from the
// schema's env() calls. To move to Postgres: change `provider` in
// prisma/schema.prisma to "postgresql" and point DATABASE_URL at the new server
// — nothing else in this file changes.
export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  datasource: {
    url: env("DATABASE_URL"),
  },
  migrations: {
    path: path.join("prisma", "migrations"),
    seed: "tsx prisma/seed.ts",
  },
});
