import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vitest/config";

const workspaceRoot = path.resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  ".."
);

const packageNames = [
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
];

const packageAliases = packageNames.flatMap((name) => {
  const basePath = path.resolve(workspaceRoot, "packages", name, "src");
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

export default createPackageVitestConfig;
