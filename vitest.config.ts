import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  resolve: {
    alias: {
      // `server-only` picks its entry from the "react-server" export condition,
      // which vitest does not set — so importing it here throws "cannot be
      // imported from a Client Component". The guard is for the Next build;
      // under test it is stubbed out.
      "server-only": new URL("./tests/server-only-stub.ts", import.meta.url).pathname,
    },
  },
  test: {
    environment: "node",
    // Component tests declare `@vitest-environment jsdom` in a docblock of
    // their own, so the rest of the suite stays on node — it is pure logic and
    // starting a DOM for it would only slow it down.
    setupFiles: ["tests/setup-dom.ts"],
    globals: true,
    // Playwright owns e2e/; vitest must not try to run those files.
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "tests/**/*.test.ts"],
    exclude: ["node_modules", ".next", "e2e"],
  },
});
