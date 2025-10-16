import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const adrPath = join(repoRoot, "docs", "adr", "0008-nestjs-cqrs-refactor.md");

const readAdr = () => readFileSync(adrPath, "utf8");

const requiredPatterns = [
  /^# ADR 0008: NestJS CQRS Realtime Migration$/m,
  /## Context[\s\S]*CQRS/m,
  /## Decision[\s\S]*(apps\/api\/src\/realtime|platform\/integrations\/api-client)[\s\S]*/m,
  /## Consequences[\s\S]*migration considerations for downstream consumers/m,
];

describe("ADR 0008 NestJS CQRS refactor", () => {
  it("is present in the adr directory", () => {
    expect(existsSync(adrPath)).toBe(true);
  });

  it("documents context, decision, consequences, and modules", () => {
    const content = readAdr();

    for (const pattern of requiredPatterns) {
      expect(content).toMatch(pattern);
    }
  });
});
