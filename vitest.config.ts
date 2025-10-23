import { defineConfig } from "vitest/config";

const workspaceProjects = [
  ["./apps/api/vitest.config.ts", "./apps/api"],
  ["./apps/web/vitest.config.ts", "./apps/web"],
  ["./apps/cli/vitest.config.ts", "./apps/cli"],
  ["./platform/ui/vitest.config.ts", "./platform/ui"],
  ["./platform/testing/ci-support/vitest.config.ts", "./platform/testing/ci-support"],
  [
    "./platform/testing/perf-benchmarks/vitest.config.ts",
    "./platform/testing/perf-benchmarks",
  ],
  [
    "./platform/integrations/api-client/vitest.config.ts",
    "./platform/integrations/api-client",
  ],
  ["./platform/runtime/engine/vitest.config.ts", "./platform/runtime/engine"],
  ["./platform/runtime/hooks/vitest.config.ts", "./platform/runtime/hooks"],
  ["./platform/runtime/memory/vitest.config.ts", "./platform/runtime/memory"],
  ["./platform/runtime/context/vitest.config.ts", "./platform/runtime/context"],
  ["./platform/runtime/io/vitest.config.ts", "./platform/runtime/io"],
  ["./platform/runtime/tools/vitest.config.ts", "./platform/runtime/tools"],
  ["./platform/core/config/vitest.config.ts", "./platform/core/config"],
  ["./platform/core/templates/vitest.config.ts", "./platform/core/templates"],
  ["./platform/core/tokenizers/vitest.config.ts", "./platform/core/tokenizers"],
  ["./platform/core/types/vitest.config.ts", "./platform/core/types"],
  ["./platform/integrations/providers/vitest.config.ts", "./platform/integrations/providers"],
  ["./platform/integrations/mcp/vitest.config.ts", "./platform/integrations/mcp"],
] as const;

export default defineConfig({
  test: {
    projects: [
      {
        root: ".",
        test: {
          environment: "node",
          include: ["tests/**/*.test.ts"],
        },
      },
      ...workspaceProjects.map(([configPath, root]) => ({
        root,
        extends: configPath,
      })),
    ],
  },
});
