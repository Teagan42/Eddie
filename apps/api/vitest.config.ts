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

export default defineConfig({
  resolve: {
    alias: packageAliases,
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
    coverage: {
      reporter: ["text", "html"],
      statements: 90,
      branches: 85,
      functions: 90,
      lines: 90,
    },
  },
});
