import { render, screen } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AgentToolsDrawer } from "./AgentToolsDrawer";
import type { AgentExecutionTreeProps } from "./AgentExecutionTree";
import type { ContextBundlesPanelProps } from "./ContextBundlesPanel";
import { Sheet } from "@/vendor/components/ui/sheet";
import { createEmptyExecutionTreeState } from "../execution-tree-state";

const executionTreeProps: AgentExecutionTreeProps[] = [];
const contextPanelProps: ContextBundlesPanelProps[] = [];

class ResizeObserverMock {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

Object.defineProperty(globalThis, "ResizeObserver", {
  value: ResizeObserverMock,
});

vi.mock("./AgentExecutionTree", () => ({
  AgentExecutionTree: (props: AgentExecutionTreeProps) => {
    executionTreeProps.push(props);
    return <div data-testid="agent-execution-tree" />;
  },
}));

vi.mock("./ContextBundlesPanel", () => ({
  ContextBundlesPanel: (props: ContextBundlesPanelProps) => {
    contextPanelProps.push(props);
    return <div data-testid="context-bundles-panel" />;
  },
}));

describe("AgentToolsDrawer", () => {
  beforeEach(() => {
    executionTreeProps.length = 0;
    contextPanelProps.length = 0;
  });

  it("renders drawer headings and forwards panel props", () => {
    const state = createEmptyExecutionTreeState();
    const handleSelectAgent = vi.fn();
    const handleTogglePanel = vi.fn();

    render(
      <Theme>
        <Sheet open>
          <AgentToolsDrawer
            executionTreeState={state}
            selectedAgentId="agent-42"
            onSelectAgent={handleSelectAgent}
            contextPanelId="context-bundles"
            contextBundles={[
              {
                id: "bundle-1",
                label: "Docs",
                summary: "Primary docs",
                sizeBytes: 1024,
                fileCount: 0,
              },
            ]}
            isContextPanelCollapsed
            onToggleContextPanel={handleTogglePanel}
          />
        </Sheet>
      </Theme>,
    );

    expect(
      screen.getByRole("heading", { name: "Agent tools" }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Agent execution" }),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Inspect tool calls, context, and spawned agents for this session.",
        { selector: "p" },
      ),
    ).toBeVisible();

    expect(executionTreeProps).toHaveLength(1);
    expect(executionTreeProps[0]).toMatchObject({
      state,
      selectedAgentId: "agent-42",
    });
    executionTreeProps[0].onSelectAgent("agent-1");
    expect(handleSelectAgent).toHaveBeenCalledWith("agent-1");

    expect(contextPanelProps).toHaveLength(1);
    expect(contextPanelProps[0]).toMatchObject({
      id: "context-bundles",
      collapsed: true,
      bundles: [expect.objectContaining({ id: "bundle-1" })],
    });
    contextPanelProps[0].onToggle("context-bundles", false);
    expect(handleTogglePanel).toHaveBeenCalledWith("context-bundles", false);
  });
});
