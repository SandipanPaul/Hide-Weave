import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "node",
    globals: true,
    // Playwright owns e2e/; vitest must not try to run those files.
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "tests/**/*.test.ts"],
    exclude: ["node_modules", ".next", "e2e"],
  },
});
