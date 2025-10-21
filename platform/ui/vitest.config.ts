import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const rootDir = fileURLToPath(new URL("./", import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    pool: "forks",
    include: ["**/*.test.ts", "**/*.test.tsx"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      reportsDirectory: "coverage",
      exclude: ["tests/**"],
    },
  },
  resolve: {
    alias: {
      "@eddie/ui": resolve(rootDir, "src"),
      "@eddie/ui/overview": resolve(rootDir, "src/overview"),
      "@eddie/ui/chat": resolve(rootDir, "src/chat"),
      "@": resolve(rootDir, "../../apps/web/src"),
      "@/": resolve(rootDir, "../../apps/web/src/"),
      "@/auth/auth-context": resolve(rootDir, "../../apps/web/src/auth/auth-context.tsx"),
      "@/api/api-provider": resolve(rootDir, "../../apps/web/src/api/api-provider.tsx"),
      "@/theme": resolve(rootDir, "../../apps/web/src/theme/index.ts"),
      "@/vendor/lib/utils": resolve(rootDir, "../../apps/web/src/vendor/lib/utils.ts"),
    },
  },
});
