import { render, screen, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { AgentToolsDrawerProps } from "../../src/chat/AgentToolsDrawer";
import type { AgentExecutionTreeProps } from "../../src/chat/AgentExecutionTree";
import type { ContextBundlesPanelProps } from "../../src/chat/ContextBundlesPanel";
import { Sheet } from "@/vendor/components/ui/sheet";
import { createEmptyExecutionTreeState } from "../execution-tree-state";

const executionTreeProps: AgentExecutionTreeProps[] = [];
const contextPanelProps: ContextBundlesPanelProps[] = [];

type AgentToolsDrawerModule = typeof import("../../src/chat/AgentToolsDrawer");
let AgentToolsDrawer: AgentToolsDrawerModule["AgentToolsDrawer"];

class ResizeObserverMock {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

Object.defineProperty(globalThis, "ResizeObserver", {
  value: ResizeObserverMock,
});

vi.mock("@eddie/ui", async () => {
  const actual = await vi.importActual<typeof import("../../src/chat")>("../../src/chat");
  return {
    ...actual,
    AgentExecutionTree: (props: AgentExecutionTreeProps) => {
      executionTreeProps.push(props);
      return <div data-testid="agent-execution-tree" />;
    },
  } satisfies Partial<typeof actual>;
});

vi.mock("../../src/chat/ContextBundlesPanel", () => ({
  ContextBundlesPanel: (props: ContextBundlesPanelProps) => {
    contextPanelProps.push(props);
    return <div data-testid="context-bundles-panel" />;
  },
}));

function createDrawerProps(
  overrides: Partial<AgentToolsDrawerProps> = {},
): AgentToolsDrawerProps {
  return {
    executionTreeState: createEmptyExecutionTreeState(),
    selectedAgentId: null,
    onSelectAgent: () => {},
    focusedToolInvocationId: null,
    onFocusToolInvocation: () => {},
    contextPanelId: "context-bundles",
    contextBundles: [],
    isContextPanelCollapsed: false,
    onToggleContextPanel: () => {},
    ...overrides,
  } satisfies AgentToolsDrawerProps;
}

function renderDrawer(overrides: Partial<AgentToolsDrawerProps> = {}): void {
  const props = createDrawerProps(overrides);
  render(
    <Sheet open>
      <AgentToolsDrawer {...props} />
    </Sheet>,
  );
}

describe("AgentToolsDrawer", () => {
  beforeAll(async () => {
    ({ AgentToolsDrawer } = await import("../../src/chat/AgentToolsDrawer"));
  });

  beforeEach(() => {
    executionTreeProps.length = 0;
    contextPanelProps.length = 0;
  });

  it("renders drawer headings and forwards panel props", async () => {
    const handleSelectAgent = vi.fn();
    const handleTogglePanel = vi.fn();
    const handleFocusTool = vi.fn();

    const state = createEmptyExecutionTreeState();
    renderDrawer({
      executionTreeState: state,
      selectedAgentId: "agent-42",
      onSelectAgent: handleSelectAgent,
      onFocusToolInvocation: handleFocusTool,
      contextBundles: [
        {
          id: "bundle-1",
          label: "Docs",
          summary: "Primary docs",
          sizeBytes: 1024,
          fileCount: 0,
        },
      ],
      isContextPanelCollapsed: true,
      onToggleContextPanel: handleTogglePanel,
    });

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

    await waitFor(() => {
      expect(executionTreeProps).toHaveLength(1);
    });
    expect(executionTreeProps[0]).toMatchObject({
      state,
      selectedAgentId: "agent-42",
      focusedInvocationId: null,
    });
    executionTreeProps[0].onSelectAgent("agent-1");
    expect(handleSelectAgent).toHaveBeenCalledWith("agent-1");
    executionTreeProps[0].onFocusInvocation?.("invocation-1");
    expect(handleFocusTool).toHaveBeenCalledWith("invocation-1");

    await waitFor(() => {
      expect(contextPanelProps).toHaveLength(1);
    });
    expect(contextPanelProps[0]).toMatchObject({
      id: "context-bundles",
      collapsed: true,
      bundles: [expect.objectContaining({ id: "bundle-1" })],
    });
    contextPanelProps[0].onToggle("context-bundles", false);
    expect(handleTogglePanel).toHaveBeenCalledWith("context-bundles", false);
  });

  it("applies accent colors based on the provided theme", async () => {
    renderDrawer({ theme: "midnight" });

    const drawer = await screen.findByRole("dialog", { name: /agent tools/i });
    expect(drawer).toHaveClass("radix-themes");
    expect(drawer).toHaveAttribute("data-accent-color", "iris");
  });

  it("falls back to the default theme when none is provided", async () => {
    renderDrawer();

    const drawer = await screen.findByRole("dialog", { name: /agent tools/i });
    expect(drawer).toHaveAttribute("data-accent-color", "jade");
  });
});
