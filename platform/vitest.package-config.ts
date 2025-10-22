import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const workspaceRoot = path.resolve(
  fileURLToPath(new URL(".", import.meta.url)),
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
} as const satisfies Record<string, string>;

const packageAliases = Object.entries(packageDirectoryMap).flatMap(([name, relativeDir]) => {
  const basePath = path.resolve(workspaceRoot, "platform", relativeDir, "src");
  return [
    { find: `@eddie/${name}`, replacement: basePath },
    { find: `@eddie/${name}/`, replacement: `${basePath}/` },
  ];
});

const coverageIncludeGlobs = ["src/**/*.ts"];

const mcpSdkBasePath = path.resolve(
  workspaceRoot,
  "node_modules",
  "@modelcontextprotocol",
  "sdk",
  "dist",
  "cjs"
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

export const createPackageVitestConfig = (packageName: string) =>
  defineConfig({
    resolve: {
      alias: [...packageAliases, ...externalAliases],
    },
    test: {
      globals: true,
      include: ["test/**/*.test.ts"],
      environment: "node",
      pool: "threads",
      passWithNoTests: true,
      coverage: {
        reporter: ["text", "json-summary"],
        include: coverageIncludeGlobs,
        reportsDirectory: path.resolve(
          workspaceRoot,
          "coverage",
          packageName
        ),
        reportOnFailure: true,
      },
    },
  });
