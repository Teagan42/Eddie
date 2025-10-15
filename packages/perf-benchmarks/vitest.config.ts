import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const workspaceRoot = fileURLToPath(new URL("../../", import.meta.url));
const packageRoot = fileURLToPath(new URL("./", import.meta.url));
const benchmarkResultsFile = path.join(
  packageRoot,
  "reports",
  "benchmark-results.json"
);
fs.mkdirSync(path.dirname(benchmarkResultsFile), { recursive: true });

function loadWorkspaceAliases() {
  const tsconfigPath = path.join(workspaceRoot, "tsconfig.base.json");
  const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, "utf-8"));
  const paths = tsconfig.compilerOptions?.paths ?? {};

  return Object.fromEntries(
    Object.entries(paths).map(([key, values]) => {
      const [first] = values as string[];
      return [key, path.resolve(workspaceRoot, first)];
    })
  );
}

const workspaceAliases = loadWorkspaceAliases();

export default defineConfig({
  resolve: {
    alias: workspaceAliases,
  },
  test: {
    globals: true,
    environment: "node",
    benchmark: {
      include: ["bench/**/*.bench.ts"],
      reporters: [
        "default",
        [
          "json",
          {
            outputFile: benchmarkResultsFile,
          },
        ],
      ],
    },
  },
});
