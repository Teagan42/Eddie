import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const packageDir = path.resolve(fileURLToPath(new URL(".", import.meta.url)));
const sourceDir = path.join(packageDir, "src");
const testDir = path.join(packageDir, "tests");
const shikiTransformersStub = path.join(
  testDir,
  "shikijs-transformers.stub.ts"
);

const createSourceAlias = (specifier: string) => [
  { find: specifier, replacement: sourceDir },
  { find: `${ specifier }/`, replacement: `${ sourceDir }/` },
];

export default defineConfig({
  resolve: {
    alias: [
      ...createSourceAlias("@eddie/ui"),
      ...createSourceAlias("@"),
      { find: "@shikijs/transformers", replacement: shikiTransformersStub },
    ],
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: [ "./vitest.setup.ts" ],
    pool: "forks",
    include: [ "**/*.test.ts", "**/*.test.tsx" ],
    coverage: {
      provider: "v8",
      reporter: [ "text", "json", "html" ],
      reportsDirectory: "coverage",
      exclude: [ "tests/**" ],
    },
  },
});
