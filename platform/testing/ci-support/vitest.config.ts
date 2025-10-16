import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.spec.ts", "src/**/__tests__/**/*.ts"],
    pool: "threads",
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json"],
      reportsDirectory: "coverage",
    },
  },
});
