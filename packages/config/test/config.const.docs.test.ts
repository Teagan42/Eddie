import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const sourcePath = join(here, "..", "src", "config.const.ts");
const sourceContent = readFileSync(sourcePath, "utf8");

const createDocPattern = (lines: string[]) =>
  new RegExp(["\\/\\*\\*", ...lines.map((line) => ` \\* ${line}`), " \\*/"].join("\\n"), "u");

describe("config tokens documentation", () => {
  it("describes module options token", () => {
    const moduleOptionsPattern = createDocPattern([
      "Provides the module options token for CLI runtime configuration.",
      "Expects a CliRuntimeOptions object describing runtime defaults.",
      "Typically injected into ConfigurableModuleClass factories to supply CLI runtime configuration.",
    ]);

    expect(sourceContent).toMatch(moduleOptionsPattern);
  });

  it("describes initial config token", () => {
    const initialConfigPattern = createDocPattern([
      "Provides the token for the initial CLI configuration snapshot.",
      "Expects a CliRuntimeOptions object produced during bootstrap resolution.",
      "Typically injected into services that need the baseline configuration values.",
    ]);

    expect(sourceContent).toMatch(initialConfigPattern);
  });

  it("describes config file path token", () => {
    const filePathPattern = createDocPattern([
      "Provides the token for the resolved CLI configuration file path.",
      "Expects a string containing the absolute path to the active configuration file.",
      "Typically injected into watchers and diagnostics reporting configuration provenance.",
    ]);

    expect(sourceContent).toMatch(filePathPattern);
  });
});
