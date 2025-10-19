import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const cliReferencePath = join(repoRoot, "docs", "cli-reference.md");
const cliReferenceContent = readFileSync(cliReferencePath, "utf8");

describe("cli reference documentation", () => {
  describe("command sections", () => {
    const commandHeadings = [
      "ask command",
      "run command",
      "chat command",
      "context command",
      "trace command",
      "config command",
    ];

    it.each(commandHeadings)("documents %s", (heading) => {
      expect(cliReferenceContent).toMatch(
        new RegExp(`###\\s+${heading}`, "i"),
      );
    });
  });

  it("documents environment variable precedence and interpolation", () => {
    expect(cliReferenceContent).toMatch(/Precedence: CLI flags/i);
    expect(cliReferenceContent).toMatch(/EDDIE_CLI_CONTEXT/);
    expect(cliReferenceContent).toMatch(/\$\{[A-Z0-9_]+\}/);
  });

  it("explains configuration discovery and merging behaviour", () => {
    expect(cliReferenceContent).toMatch(/eddie\.config\.ya?ml/i);
    expect(cliReferenceContent).toMatch(/\.eddierc/i);
    expect(cliReferenceContent).toMatch(/CONFIG_ROOT/);
  });

  it("lists troubleshooting guidance for common cli errors", () => {
    expect(cliReferenceContent).toMatch(/requires a prompt/i);
    expect(cliReferenceContent).toMatch(/Unable to read trace/i);
  });

  it("covers performance tuning guidance for context and tokens", () => {
    expect(cliReferenceContent).toMatch(/token budget/i);
    expect(cliReferenceContent).toMatch(/maxFiles/i);
    expect(cliReferenceContent).toMatch(/maxBytes/i);
  });

  it("documents the configuration wizard and positional rules for config", () => {
    expect(cliReferenceContent).toMatch(/###\s+config command/i);
    expect(cliReferenceContent).toMatch(/configuration wizard/i);
    expect(cliReferenceContent).toMatch(/takes no positional arguments/i);
    expect(cliReferenceContent).toMatch(/\.\/configuration-wizard\.md/i);
  });

  it("details metrics backend flag options and advanced configuration link", () => {
    expect(cliReferenceContent).toMatch(/--metrics-backend/);
    expect(cliReferenceContent).toMatch(/otel/i);
    expect(cliReferenceContent).toMatch(/metrics-backend-level applies/i);
    expect(cliReferenceContent).toMatch(/See .*configuration/i);
  });
});
