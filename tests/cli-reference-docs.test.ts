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

  it("documents notification stream records and hooks", () => {
    const patterns = [
      /\[notification\]/i,
      /HOOK_EVENTS\.notification/,
      /provider notifications/i,
      /tool (?:error|failure) handling/i,
    ];

    for (const pattern of patterns) {
      expect(cliReferenceContent).toMatch(pattern);
    }
  });
});
