import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const sourcePath = join(here, "..", "src", "provider.tokens.ts");

const createDocPattern = (lines: string[]) =>
  new RegExp(["\\/\\*\\*", ...lines.map((line) => ` \\* ${line}`), " \\*/"].join("\\n"), "u");

describe("PROVIDER_ADAPTER_FACTORIES documentation", () => {
  it("states purpose, provider shape, and injection site", () => {
    const content = readFileSync(sourcePath, "utf8");
    const docBlockPattern = createDocPattern([
      "Provides the dependency injection token for provider adapter factories.",
      "Expects an array of ProviderAdapterFactory implementations describing supported providers.",
      "Typically injected into registration modules that compose ProviderAdapter services.",
    ]);

    expect(content).toMatch(docBlockPattern);
  });
});
