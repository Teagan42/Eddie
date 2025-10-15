import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const sourcePath = join(here, "..", "src", "tokenizer.service.ts");

describe("TOKENIZER_STRATEGIES documentation", () => {
  it("explains usage, provider shape, and injection site", () => {
    const content = readFileSync(sourcePath, "utf8");
    const docBlockPattern = new RegExp(
      [
        "\\/\\*\\*",
        " \\* Provides a dependency injection token for tokenizer strategies.",
        " \\* Expects a TokenizerStrategyRegistry mapping provider identifiers to strategies or factories.",
        " \\* Typically injected into the TokenizerService to resolve provider-specific implementations.",
        " \\*/",
      ].join("\\n"),
      "u"
    );

    expect(content).toMatch(docBlockPattern);
  });
});
