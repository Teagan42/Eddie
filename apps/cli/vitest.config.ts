import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vitest/config";

const workspaceRoot = path.resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "..",
  ".."
);

const packageDirectoryMap = {
  config: path.join("core", "config"),
  context: path.join("runtime", "context"),
  engine: path.join("runtime", "engine"),
  hooks: path.join("runtime", "hooks"),
  io: path.join("runtime", "io"),
  mcp: path.join("integrations", "mcp"),
  providers: path.join("integrations", "providers"),
  templates: path.join("core", "templates"),
  tokenizers: path.join("core", "tokenizers"),
  tools: path.join("runtime", "tools"),
  types: path.join("core", "types"),
} as const;

const packageAliases = Object.entries(packageDirectoryMap).flatMap(([name, relativeDir]) => {
  const basePath = path.resolve(workspaceRoot, "platform", relativeDir, "src");
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
    pool: "threads",
    coverage: {
      reporter: ["text", "html"],
    },
  },
});
