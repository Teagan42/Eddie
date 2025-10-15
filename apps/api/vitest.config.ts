import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vitest/config";

const workspaceRoot = path.resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "..",
  ".."
);

const packagesDir = path.resolve(workspaceRoot, "packages");
const packageAliases = fs
  .readdirSync(packagesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .flatMap((entry) => {
    const basePath = path.resolve(packagesDir, entry.name, "src");
    return [
      { find: `@eddie/${entry.name}`, replacement: basePath },
      { find: `@eddie/${entry.name}/`, replacement: `${basePath}/` },
    ];
  });

const mcpSdkBasePath = path.resolve(
  workspaceRoot,
  "node_modules",
  "@modelcontextprotocol",
  "sdk",
  "dist",
  "cjs",
);

const externalAliases = [
  {
    find: "@modelcontextprotocol/sdk/client/index.js",
    replacement: path.join(mcpSdkBasePath, "client", "index.js"),
  },
  {
    find: "@modelcontextprotocol/sdk/client/streamableHttp.js",
    replacement: path.join(mcpSdkBasePath, "client", "streamableHttp.js"),
  },
  {
    find: "@modelcontextprotocol/sdk/client/sse.js",
    replacement: path.join(mcpSdkBasePath, "client", "sse.js"),
  },
];

export default defineConfig({
  resolve: {
    alias: [...packageAliases, ...externalAliases],
  },
  esbuild: {
    tsconfigRaw: {
      compilerOptions: {
        useDefineForClassFields: false,
      },
    },
  },
  test: {
    globals: true,
    include: ["test/**/*.test.ts"],
    environment: "node",
    pool: "threads",
    coverage: {
      reporter: ["text", "html"],
      statements: 90,
      branches: 85,
      functions: 90,
      lines: 90,
    },
  },
});
