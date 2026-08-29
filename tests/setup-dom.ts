/**
 * Adds the DOM matchers (`toBeInTheDocument`, `toBeDisabled`) to expect, and
 * gives the async helpers room to breathe.
 *
 * Loaded for every test file, not just the component ones: importing the
 * matchers is harmless without a DOM, and making it conditional would mean a
 * new component test silently losing them.
 */
import "@testing-library/jest-dom/vitest";

if (typeof document !== "undefined") {
  const { configure } = await import("@testing-library/react");
  // Testing Library waits one second by default. The rest of the suite runs
  // real migrations against real SQLite files in parallel with these, and under
  // that load a second is enough to fail a test that is only slow, not broken —
  // which is worse than a slow test, because it teaches you to ignore failures.
  configure({ asyncUtilTimeout: 5000 });
}
