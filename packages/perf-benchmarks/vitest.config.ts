import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: [],
    benchmark: {
      include: ["bench/**/*.bench.ts"],
    },
  },
});
