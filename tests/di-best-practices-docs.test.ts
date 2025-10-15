import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

const readRepoFile = (...segments: string[]): string =>
  readFileSync(join(repoRoot, ...segments), "utf8");

describe("dependency injection best practices guide", () => {
  it("covers constructor injection, tokens, module boundaries, and testing", () => {
    const diGuideContent = readRepoFile("docs", "di-best-practices.md");
    expect(diGuideContent).toMatch(/constructor injection/i);
    expect(diGuideContent).toMatch(/injection tokens?/i);
    expect(diGuideContent).toMatch(/module boundaries/i);
    expect(diGuideContent).toMatch(/testing strateg(y|ies)/i);
  });

  it("highlights config, engine, and providers package examples", () => {
    const diGuideContent = readRepoFile("docs", "di-best-practices.md");
    expect(diGuideContent).toMatch(/@eddie\/config/i);
    expect(diGuideContent).toMatch(/@eddie\/engine/i);
    expect(diGuideContent).toMatch(/@eddie\/providers/i);
  });

  it("is linked from the packages contribution guide", () => {
    const packagesAgentsContent = readRepoFile("packages", "AGENTS.md");
    expect(packagesAgentsContent).toMatch(/di-best-practices\.md/);
  });

  it("is discoverable from the API documentation", () => {
    const apiDocsContent = readRepoFile("docs", "api.md");
    expect(apiDocsContent).toMatch(/di-best-practices\.md/);
  });
});
