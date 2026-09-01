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
  // against real SQLite files in parallel with these, and under that load a
  // second is nowhere near enough — a test that fails only when the machine is
  // busy is a false alarm, and false alarms are what teach people to ignore a
  // suite. Generous on purpose: `waitFor` returns the moment its condition
  // holds, so a passing test pays nothing for the headroom.
  configure({ asyncUtilTimeout: 10000 });
}
