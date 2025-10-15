import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const docPath = join(repoRoot, "docs", "migration", "api-cqrs-design.md");

const requiredPatterns = [
  /^# API CQRS Migration Blueprint/m,
  /## Chat Sessions[\s\S]*### Commands[\s\S]*### Queries[\s\S]*### Events/m,
  /## Traces[\s\S]*### Commands[\s\S]*### Queries[\s\S]*### Events/m,
  /## Runtime Config[\s\S]*### Commands[\s\S]*### Queries[\s\S]*### Events/m,
  /## Tools[\s\S]*### Commands[\s\S]*### Queries[\s\S]*### Events/m,
  /## Chat Message Streaming[\s\S]*### Commands[\s\S]*### Events/m,
  /### Handler Boundaries/m,
  /apps\/api\/src\/chat-sessions\/commands/, 
  /apps\/api\/src\/traces\/queries/, 
  /Aggregate Dependencies/m,
];

describe("api cqrs migration design note", () => {
  it("is present in the migration docs folder", () => {
    expect(existsSync(docPath)).toBe(true);
  });

  const readDocContent = () => readFileSync(docPath, "utf8");

  it("documents CQRS scope and handler layout", () => {
    const content = readDocContent();

    for (const pattern of requiredPatterns) {
      expect(content).toMatch(pattern);
    }
  });
});
