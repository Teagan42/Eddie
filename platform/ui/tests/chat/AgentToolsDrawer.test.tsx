import { render, screen } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AgentToolsDrawer, type AgentToolsDrawerProps } from "../../src/chat/AgentToolsDrawer";
import type {
  AgentExecutionTreeProps,
  ContextBundlesPanelProps,
  ExecutionContextBundle,
  ExecutionTreeState,
} from "../../src/chat";

const executionTreeProps: AgentExecutionTreeProps[] = [];
const contextPanelProps: ContextBundlesPanelProps[] = [];

vi.mock("../../src/chat/AgentExecutionTree", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/chat/AgentExecutionTree")>();
  return {
    ...actual,
    AgentExecutionTree: (props: AgentExecutionTreeProps) => {
      executionTreeProps.push(props);
      return <div data-testid="agent-execution-tree" />;
    },
  };
});

vi.mock("../../src/chat/ContextBundlesPanel", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/chat/ContextBundlesPanel")>();
  return {
    ...actual,
    ContextBundlesPanel: (props: ContextBundlesPanelProps) => {
      contextPanelProps.push(props);
      return <div data-testid="context-bundles-panel" />;
    },
  };
});

Object.defineProperty(globalThis, "ResizeObserver", {
  configurable: true,
  value: class ResizeObserverMock {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  },
});

function createEmptyExecutionTreeState(): ExecutionTreeState {
  return {
    agentHierarchy: [],
    toolInvocations: [],
    contextBundles: [],
    agentLineageById: {},
    toolGroupsByAgentId: {},
    contextBundlesByAgentId: {},
    contextBundlesByToolCallId: {},
    createdAt: "1970-01-01T00:00:00.000Z",
    updatedAt: "1970-01-01T00:00:00.000Z",
  } satisfies ExecutionTreeState;
}

function createDrawerProps(
  overrides: Partial<AgentToolsDrawerProps> = {},
): AgentToolsDrawerProps {
  return {
    executionTreeState: overrides.executionTreeState ?? createEmptyExecutionTreeState(),
    selectedAgentId: overrides.selectedAgentId ?? null,
    onSelectAgent: overrides.onSelectAgent ?? (() => {}),
    focusedToolInvocationId: overrides.focusedToolInvocationId ?? null,
    onFocusToolInvocation: overrides.onFocusToolInvocation ?? (() => {}),
    contextPanelId: overrides.contextPanelId ?? "context-bundles",
    contextBundles: overrides.contextBundles ?? [],
    isContextPanelCollapsed: overrides.isContextPanelCollapsed ?? false,
    onToggleContextPanel: overrides.onToggleContextPanel ?? (() => {}),
  } satisfies AgentToolsDrawerProps;
}

function renderDrawer(
  overrides: Partial<AgentToolsDrawerProps> = {},
  options: { wrapWithTheme?: boolean } = {},
): void {
  const props = createDrawerProps(overrides);
  const content = <AgentToolsDrawer {...props} />;
  if (options.wrapWithTheme === false) {
    render(content);
    return;
  }
  render(<Theme>{content}</Theme>);
}

describe("AgentToolsDrawer", () => {
  beforeEach(() => {
    executionTreeProps.length = 0;
    contextPanelProps.length = 0;
  });

  it("renders drawer headings and forwards panel props", () => {
    const handleSelectAgent = vi.fn();
    const handleTogglePanel = vi.fn();
    const handleFocusTool = vi.fn();

    const state = createEmptyExecutionTreeState();
    renderDrawer(
      {
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
            source: {
              type: "tool_call",
              agentId: "agent-1",
              toolCallId: "tool-call-1",
            },
          } satisfies ExecutionContextBundle,
        ],
        isContextPanelCollapsed: true,
        onToggleContextPanel: handleTogglePanel,
      },
      { wrapWithTheme: true },
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
      focusedInvocationId: null,
    });
    executionTreeProps[0].onSelectAgent("agent-1");
    expect(handleSelectAgent).toHaveBeenCalledWith("agent-1");
    executionTreeProps[0].onFocusInvocation?.("invocation-1");
    expect(handleFocusTool).toHaveBeenCalledWith("invocation-1");

    expect(contextPanelProps).toHaveLength(1);
    expect(contextPanelProps[0]).toMatchObject({
      id: "context-bundles",
      collapsed: true,
      bundles: [expect.objectContaining({ id: "bundle-1" })],
    });
    contextPanelProps[0].onToggle("context-bundles", false);
    expect(handleTogglePanel).toHaveBeenCalledWith("context-bundles", false);
  });

  it("applies the active theme to the sheet content", async () => {
    renderDrawer({}, { wrapWithTheme: true });

    const drawer = await screen.findByRole("dialog", { name: /agent tools/i });
    expect(drawer).toHaveClass("radix-themes");
  });

  it("falls back to a default theme when the provider is unavailable", async () => {
    renderDrawer({}, { wrapWithTheme: false });

    const drawer = await screen.findByRole("dialog", { name: /agent tools/i });
    expect(drawer).toHaveClass("radix-themes");
  });
});
