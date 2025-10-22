import { beforeAll, describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const docPath = join(
  repoRoot,
  "docs",
  "migration",
  "api-realtime-events.md"
);

const requiredHeadings = Object.freeze([
  /^# API Realtime Event Inventory$/m,
  /^## ChatSessionsService$/m,
  /^## ChatSessionStreamRendererService$/m,
  /^## TracesService$/m,
  /^## RuntimeConfigService$/m,
  /^## LogsForwarderService$/m,
]);

const requiredTableRows = Object.freeze([
  /\| ChatSessionsService \| session\.created \|/,
  /\| ChatSessionsService \| ChatMessageCreatedEvent \|/,
  /\| ChatSessionStreamRendererService \| ChatMessagePartialEvent \|/,
  /\| TracesService \| trace\.created \|/,
  /\| TracesService \| trace\.updated \|/,
  /\| RuntimeConfigService \| config\.updated \|/,
  /\| LogsForwarderService \| logs\.created \|/,
]);

describe("api realtime events inventory doc", () => {
  let content: string;

  beforeAll(() => {
    content = readFileSync(docPath, "utf8");
  });

  it("is present in the migration docs folder", () => {
    expect(existsSync(docPath)).toBe(true);
  });

  it.each(requiredHeadings.map((pattern) => [pattern]))(
    "includes heading %s",
    (pattern) => {
      expect(content).toMatch(pattern);
    }
  );

  it.each(requiredTableRows.map((pattern) => [pattern]))(
    "documents row matching %s",
    (pattern) => {
      expect(content).toMatch(pattern);
    }
  );
});
