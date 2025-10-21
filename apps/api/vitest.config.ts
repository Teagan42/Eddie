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

export const GLOBAL_COVERAGE_THRESHOLDS = Object.freeze({
  statements: 75,
  branches: 65,
  functions: 80,
  lines: 75,
} as const);

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
    include: ["./**/*.test.ts"],
    environment: "node",
    // pool: "threads",
    coverage: {
      reporter: ["text", "html"],
      thresholds: {
        global: GLOBAL_COVERAGE_THRESHOLDS,
      },
    },
  },
});
