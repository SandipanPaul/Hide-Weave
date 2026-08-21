import { cleanupE2ERows } from "./db-cleanup";

/**
 * Also clean before the run: a crashed or interrupted run would otherwise
 * leave rows behind that collide with the next one.
 */
export default function globalSetup() {
  const removed = cleanupE2ERows();
  if (removed > 0) console.log(`Removed ${removed} leftover e2e client(s) before starting.`);
}
