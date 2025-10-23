import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  renderDatabaseDiagramMermaid,
  writeDatabaseDiagramMarkdownFile,
} from "../../../scripts/render-database-diagram";

describe("renderDatabaseDiagramMermaid", () => {
  it("describes chat session relationships", async () => {
    const diagram = await renderDatabaseDiagramMermaid();

    expect(diagram).toContain("erDiagram");
    expect(diagram).toContain("chat_sessions {");
    expect(diagram).toContain(
      "chat_sessions ||--o{ chat_messages : \"id -> session_id\"",
    );
  });
});

describe("writeDatabaseDiagramMarkdownFile", () => {
  it("writes the markdown diagram to the provided path", async () => {
    const directory = await mkdtemp(join(tmpdir(), "eddie-diagram-"));
    const outputPath = join(directory, "diagram.md");

    await writeDatabaseDiagramMarkdownFile(outputPath);

    const content = await readFile(outputPath, "utf8");
    expect(content).toContain("```mermaid");
    expect(content).toContain(
      "chat_sessions ||--o{ chat_messages : \"id -> session_id\"",
    );
  });
});
