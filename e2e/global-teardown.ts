import { cleanupE2ERows } from "./db-cleanup";

export default function globalTeardown() {
  const removed = cleanupE2ERows();
  if (removed > 0) console.log(`Cleaned up ${removed} e2e client(s).`);
}
