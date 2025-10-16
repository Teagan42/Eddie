import { describe, expect, it } from "vitest";

import { EDDIE_CONFIG_SCHEMA_BUNDLE } from "../src/schema";
import { renderConfigSchemaMermaid } from "../scripts/render-config-schema-diagram";

describe("renderConfigSchemaMermaid", () => {
  it("connects root to key configuration sections", () => {
    const diagram = renderConfigSchemaMermaid(EDDIE_CONFIG_SCHEMA_BUNDLE);

    expect(diagram).toContain("graph LR");
    expect(diagram).toContain("root[Eddie Configuration]");
    expect(diagram).toContain("root --> model");
    expect(diagram).toContain("root --> provider");
    expect(diagram).toContain("root --> agents");
    expect(diagram).toContain("agents --> agents__subagents");
  });

  it("marks required fields without breaking mermaid syntax", () => {
    const diagram = renderConfigSchemaMermaid(EDDIE_CONFIG_SCHEMA_BUNDLE);

    expect(diagram).toContain(
      'api__persistence__driver["driver (required): enum(5)"]',
    );
    expect(diagram).not.toContain("driver*");
  });

  it("wraps complex labels in quotes for mermaid compatibility", () => {
    const diagram = renderConfigSchemaMermaid(EDDIE_CONFIG_SCHEMA_BUNDLE);

    expect(diagram).toContain(
      'agents["agents (required): object"]',
    );
    expect(diagram).toContain(
      'agents__subagents["subagents (required): array<object>"]',
    );
  });
});
