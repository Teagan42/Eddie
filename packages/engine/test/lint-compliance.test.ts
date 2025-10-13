import { ESLint } from "eslint";
import path from "node:path";

describe("lint compliance", () => {
  it("agent orchestrator and runner adhere to lint rules", async () => {
    const repoRoot = path.resolve(__dirname, "../../..");
    const eslint = new ESLint({
      cwd: repoRoot,
      overrideConfigFile: path.join(repoRoot, "eslint.config.cjs"),
    });

    const lintTargets = [
      "packages/engine/src/agents/agent-orchestrator.service.ts",
      "packages/engine/src/agents/agent-runner.ts",
    ];

    const results = await eslint.lintFiles(lintTargets);

    const errorCount = results.reduce((sum, result) => sum + result.errorCount, 0);

    expect(errorCount).toBe(0);
  });
});
