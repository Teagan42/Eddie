import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vitest/config";

const workspaceRoot = path.resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "..",
  ".."
);

const packageAliases = [
  "config",
  "context",
  "engine",
  "hooks",
  "io",
  "mcp",
  "providers",
  "templates",
  "tokenizers",
  "tools",
  "types",
].flatMap((name) => {
  const basePath = path.resolve(workspaceRoot, "packages", name, "src");
  return [
    { find: `@eddie/${name}`, replacement: basePath },
    { find: `@eddie/${name}/`, replacement: `${basePath}/` },
  ];
});

export default defineConfig({
  resolve: {
    alias: packageAliases,
  },
  test: {
    globals: true,
    include: ["test/**/*.test.ts"],
    coverage: {
      reporter: ["text", "html"],
    },
  },
});
