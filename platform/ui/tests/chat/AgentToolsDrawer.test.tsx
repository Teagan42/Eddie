import { render, screen, waitFor } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentToolsDrawerProps } from "../../src/chat/AgentToolsDrawer";
import type { AgentExecutionTreeProps } from "../../src/chat/AgentExecutionTree";
import type { ContextBundlesPanelProps } from "../../src/chat/ContextBundlesPanel";
import { Sheet } from "@/vendor/components/ui/sheet";
import { createEmptyExecutionTreeState } from "../execution-tree-state";

const DEFAULT_APPEARANCE = "dark" as const;
const DEFAULT_ACCENT = "jade" as const;

const executionTreeProps: AgentExecutionTreeProps[] = [];
const contextPanelProps: ContextBundlesPanelProps[] = [];
const useThemeMock = vi.fn(() => ({ theme: DEFAULT_APPEARANCE, setTheme: vi.fn(), isThemeStale: false }));

type AgentToolsDrawerModule = typeof import("../../src/chat/AgentToolsDrawer");
let AgentToolsDrawer: AgentToolsDrawerModule["AgentToolsDrawer"];

vi.mock("@/theme", () => ({
  useTheme: () => useThemeMock(),
  getThemeAccentColor: () => DEFAULT_ACCENT,
  getThemeAppearance: () => DEFAULT_APPEARANCE,
}));

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
    useTheme: overrides.useTheme ?? useThemeMock,
    getThemeAccentColor: overrides.getThemeAccentColor ?? (() => DEFAULT_ACCENT),
    getThemeAppearance: overrides.getThemeAppearance ?? (() => DEFAULT_APPEARANCE),
  } satisfies AgentToolsDrawerProps;
}

function renderDrawer(
  overrides: Partial<AgentToolsDrawerProps> = {},
  options: { wrapWithTheme?: boolean } = {},
): void {
  const props = createDrawerProps(overrides);
  const content = (
    <Sheet open>
      <AgentToolsDrawer {...props} />
    </Sheet>
  );
  if (options.wrapWithTheme === false) {
    render(content);
    return;
  }
  render(<Theme>{content}</Theme>);
}

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

describe("AgentToolsDrawer", () => {
  beforeAll(async () => {
    ({ AgentToolsDrawer } = await import("../../src/chat/AgentToolsDrawer"));
  });

  beforeEach(() => {
    executionTreeProps.length = 0;
    contextPanelProps.length = 0;
    useThemeMock.mockReset();
    useThemeMock.mockReturnValue({ theme: "dark", setTheme: vi.fn(), isThemeStale: false });
  });

  it("renders drawer headings and forwards panel props", async () => {
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
          },
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

  it("applies the active theme to the sheet content", async () => {
    renderDrawer({}, { wrapWithTheme: true });

    const drawer = await screen.findByRole("dialog", { name: /agent tools/i });
    expect(drawer).toHaveClass("radix-themes");
  });

  it("falls back to a default theme when the provider is unavailable", async () => {
    useThemeMock.mockImplementation(() => {
      throw new Error("no theme context");
    });

    renderDrawer({}, { wrapWithTheme: false });

    const drawer = await screen.findByRole("dialog", { name: /agent tools/i });
    expect(drawer).toHaveClass("radix-themes");
  });
});
