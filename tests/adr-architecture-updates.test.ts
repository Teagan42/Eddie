import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

const adrBase = join(repoRoot, "docs", "adr");

const adrPathFor = (filename: string): string => join(adrBase, filename);

const assertMatchesAll = (content: string, patterns: RegExp[]): void => {
  for (const pattern of patterns) {
    expect(content).toMatch(pattern);
  }
};

const adrExpectations = [
  {
    filename: "0009-web-ui-architecture.md",
    title: /^# ADR 0009: Web UI Architecture and Component Structure$/m,
    patterns: [
      /## Context[\s\S]*component hierarchy/m,
      /## Decision[\s\S]*apps\/web/m,
      /## Consequences[\s\S]*maintainability/m,
      /## Alternatives Considered[\s\S]*single monolith/m,
    ],
  },
  {
    filename: "0010-api-persistence-layer.md",
    title: /^# ADR 0010: API Persistence Layer and Multi-Database Support$/m,
    patterns: [
      /## Context[\s\S]*(multi|poly)glot persistence/m,
      /## Decision[\s\S]*Prisma/m,
      /## Consequences[\s\S]*operational overhead/m,
      /## Alternatives Considered[\s\S]*single database/m,
    ],
  },
  {
    filename: "0011-mcp-integration.md",
    title: /^# ADR 0011: MCP Integration Architecture$/m,
    patterns: [
      /## Context[\s\S]*Model Context Protocol/m,
      /## Decision[\s\S]*platform\/integrations\/mcp/m,
      /## Consequences[\s\S]*tooling compatibility/m,
      /## Alternatives Considered[\s\S]*custom integration/m,
    ],
  },
  {
    filename: "0012-template-engine.md",
    title: /^# ADR 0012: Template Engine Selection and Jinja Adoption$/m,
    patterns: [
      /## Context[\s\S]*templating/m,
      /## Decision[\s\S]*Jinja/m,
      /## Consequences[\s\S]*learning curve/m,
      /## Alternatives Considered[\s\S]*(Handlebars|Nunjucks)/m,
    ],
  },
  {
    filename: "0013-realtime-event-streaming.md",
    title: /^# ADR 0013: Real-time Event Streaming Architecture$/m,
    patterns: [
      /## Context[\s\S]*event streaming/m,
      /## Decision[\s\S]*Kafka|WebSocket/m,
      /## Consequences[\s\S]*latency|throughput/m,
      /## Alternatives Considered[\s\S]*polling/m,
    ],
  },
];

describe("recent architecture ADR coverage", () => {
  for (const adr of adrExpectations) {
    const adrPath = adrPathFor(adr.filename);

    describe(adr.filename, () => {
      it("is present in the adr directory", () => {
        expect(existsSync(adrPath)).toBe(true);
      });

      it("documents title and required sections", () => {
        const content = readFileSync(adrPath, "utf8");

        expect(content).toMatch(adr.title);
        assertMatchesAll(content, adr.patterns);
      });
    });
  }
});
