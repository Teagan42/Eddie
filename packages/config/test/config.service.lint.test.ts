import { describe, expect, it } from "vitest";
import { ESLint } from "eslint";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, "..");
const targetFile = path.join(packageRoot, "src/config.service.ts");

describe("config.service lint", () => {
  it("passes eslint rules for config.service.ts", async () => {
    const eslint = new ESLint({ cwd: packageRoot });
    const [result] = await eslint.lintFiles([targetFile]);
    const errorMessages = result.messages
      .filter((message) => message.severity === 2)
      .map((message) =>
        `${message.line}:${message.column} ${message.message} (${message.ruleId ?? ""})`
      );

    expect(errorMessages).toEqual([]);
  });
});
