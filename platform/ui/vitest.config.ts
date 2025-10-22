import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const workspaceRoot = fileURLToPath(new URL("./", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(workspaceRoot, "src"),
      "@eddie/ui": resolve(workspaceRoot, "src/index.ts"),
      "@shikijs/transformers": resolve(workspaceRoot, "tests/mocks/shiki-transformers.ts"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    pool: "threads",
    include: ["**/*.test.ts", "**/*.test.tsx"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      reportsDirectory: "coverage",
      exclude: ["tests/**"],
    },
  },
});
