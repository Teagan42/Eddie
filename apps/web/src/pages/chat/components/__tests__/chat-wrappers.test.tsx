import { createEmptyExecutionTreeState } from "@eddie/ui";
import { describe, expect, it } from "vitest";

const loadSessionSelector = () => import("../SessionSelector");
const loadCollapsiblePanel = () => import("../CollapsiblePanel");

describe("chat page component wrappers", () => {
  it("re-exports the chat sessions aria label from the UI toolkit", async () => {
    const { SESSION_TABLIST_ARIA_LABEL } = await loadSessionSelector();
    expect(SESSION_TABLIST_ARIA_LABEL).toBe("Chat sessions");
  });

  it("exposes the CollapsiblePanel component for local tests", async () => {
    const { CollapsiblePanel } = await loadCollapsiblePanel();
    expect(typeof CollapsiblePanel).toBe("function");
  });
});

describe("@shikijs/transformers integration", () => {
  it("provides a highlight transformer factory for code comparison", async () => {
    const { transformerNotationHighlight } = await import("@shikijs/transformers");

    const transformer = transformerNotationHighlight({ matchAlgorithm: "v3" });

    expect(transformer).toHaveProperty("name");
    expect(transformer).toMatchObject({ name: expect.stringContaining("highlight") });
  });
});

describe("AgentToolsDrawer wrapper", () => {
  it("exposes default theme helpers to the drawer component", async () => {
    const { AgentToolsDrawer } = await import("../AgentToolsDrawer");

    expect(() =>
      AgentToolsDrawer({
        executionTreeState: createEmptyExecutionTreeState(),
        selectedAgentId: null,
        onSelectAgent: () => {},
        focusedToolInvocationId: null,
        onFocusToolInvocation: () => {},
        contextPanelId: "context",
        contextBundles: [],
        isContextPanelCollapsed: false,
        onToggleContextPanel: () => {},
      }),
    ).not.toThrow();
  });
});
