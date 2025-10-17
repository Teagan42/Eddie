import userEvent from "@testing-library/user-event";
import { QueryClient } from "@tanstack/react-query";
import { act, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrchestratorMetadataDto } from "@eddie/api-client";

import { createChatPageRenderer } from "./test-utils";

const toolCallHandlers: Array<(payload: any) => void> = [];
const toolResultHandlers: Array<(payload: any) => void> = [];

const listSessionsMock = vi.fn();
const listMessagesMock = vi.fn();
const getMetadataMock = vi.fn();
const catalogMock = vi.fn();
const updatePreferencesMock = vi.fn();

class ResizeObserverMock {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

Object.defineProperty(globalThis, "ResizeObserver", {
  value: ResizeObserverMock,
});

Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
  value: vi.fn(),
  writable: true,
});

vi.mock("@/hooks/useLayoutPreferences", () => ({
  useLayoutPreferences: () => ({
    preferences: {
      chat: {
        selectedSessionId: "session-1",
        collapsedPanels: {},
        sessionSettings: {},
        templates: {},
      },
    },
    updatePreferences: updatePreferencesMock,
    isSyncing: false,
    isRemoteAvailable: true,
  }),
}));

vi.mock("@/vendor/hooks/use-toast", () => ({
  toast: vi.fn(),
  useToast: () => ({ toast: vi.fn(), dismiss: vi.fn(), toasts: [] }),
}));

vi.mock("@/api/api-provider", () => ({
  useApi: () => ({
    http: {
      chatSessions: {
        list: listSessionsMock,
        listMessages: listMessagesMock,
        create: vi.fn(),
        rename: vi.fn(),
        delete: vi.fn(),
        get: vi.fn(),
        archive: vi.fn(),
        createMessage: vi.fn(),
      },
      orchestrator: {
        getMetadata: getMetadataMock,
      },
      providers: {
        catalog: catalogMock,
      },
    },
    sockets: {
      chatSessions: {
        onSessionCreated: vi.fn().mockReturnValue(() => {}),
        onSessionUpdated: vi.fn().mockReturnValue(() => {}),
        onSessionDeleted: vi.fn().mockReturnValue(() => {}),
        onMessageCreated: vi.fn().mockReturnValue(() => {}),
        onMessageUpdated: vi.fn().mockReturnValue(() => {}),
        onAgentActivity: vi.fn().mockReturnValue(() => {}),
      },
      traces: {
        onTraceCreated: vi.fn().mockReturnValue(() => {}),
        onTraceUpdated: vi.fn().mockReturnValue(() => {}),
      },
      tools: {
        onToolCall: vi.fn((handler: (payload: any) => void) => {
          toolCallHandlers.push(handler);
          return () => {
            const index = toolCallHandlers.indexOf(handler);
            if (index >= 0) {
              toolCallHandlers.splice(index, 1);
            }
          };
        }),
        onToolResult: vi.fn((handler: (payload: any) => void) => {
          toolResultHandlers.push(handler);
          return () => {
            const index = toolResultHandlers.indexOf(handler);
            if (index >= 0) {
              toolResultHandlers.splice(index, 1);
            }
          };
        }),
      },
    },
  }),
}));

const renderChatPage = createChatPageRenderer(
  () =>
    new QueryClient({
      defaultOptions: { queries: { retry: false } },
    }),
);

const baseSession = {
  id: "session-1",
  title: "Delegation run",
  description: "",
  status: "active" as const,
  createdAt: "2024-05-01T12:00:00.000Z",
  updatedAt: "2024-05-01T12:00:00.000Z",
};

describe("ChatPage agent execution realtime updates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toolCallHandlers.length = 0;
    toolResultHandlers.length = 0;

    listSessionsMock.mockResolvedValue([baseSession]);
    listMessagesMock.mockResolvedValue([]);
    catalogMock.mockResolvedValue([]);
    getMetadataMock.mockResolvedValue({
      sessionId: "session-1",
      agentHierarchy: [
        {
          id: "root-agent",
          name: "orchestrator",
          provider: "openai",
          model: "gpt-4o",
          depth: 0,
          metadata: { messageCount: 0 },
          children: [],
        },
      ],
      toolInvocations: [],
      contextBundles: [],
    });
  });

  it("merges tool lifecycle and spawn metadata into the execution tree", async () => {
    const user = userEvent.setup();
    const handle = renderChatPage();

    await waitFor(() => expect(toolCallHandlers).toHaveLength(1));
    await waitFor(() => expect(toolResultHandlers).toHaveLength(1));

    await screen.findByRole("button", { name: /select orchestrator agent/i });

    await act(async () => {
      toolCallHandlers.forEach((handler) =>
        handler({
          sessionId: "session-1",
          id: "call-spawn",
          name: "spawn_subagent",
          agentId: "root-agent",
          arguments: { instructions: "Investigate the latest TypeScript release" },
          timestamp: "2024-05-01T12:00:05.000Z",
        }),
      );
    });

    const runningToggle = await screen.findByRole("button", {
      name: /toggle running tool invocations for orchestrator/i,
    });
    await user.click(runningToggle);

    const runningRegion = await screen.findByRole("region", {
      name: /running tool invocations for orchestrator/i,
    });
    expect(within(runningRegion).getByText(/spawn_subagent/i)).toBeInTheDocument();

    await act(async () => {
      toolResultHandlers.forEach((handler) =>
        handler({
          sessionId: "session-1",
          id: "call-spawn",
          name: "spawn_subagent",
          agentId: "root-agent",
          result: JSON.stringify({
            schema: "eddie.tool.spawn_subagent.result.v1",
            content: "Delegated to research analyst",
            metadata: {
              agentId: "agent-researcher",
              agentName: "Research Analyst",
              parentAgentId: "root-agent",
              provider: "openai",
              model: "gpt-4o-mini",
              contextBundles: [
                {
                  id: "bundle-research",
                  title: "Research context",
                  source: "spawn_subagent",
                  createdAt: "2024-05-01T12:00:10.000Z",
                  metadata: { notes: "TypeScript 5.5" },
                  files: [
                    { id: "file-notes", name: "release-notes.md", size: 512, metadata: {} },
                  ],
                },
              ],
            },
          }),
          timestamp: "2024-05-01T12:00:12.000Z",
        }),
      );
    });

    const completedToggle = await screen.findByRole("button", {
      name: /toggle completed tool invocations for orchestrator/i,
    });
    await user.click(completedToggle);

    const completedRegion = await screen.findByRole("region", {
      name: /completed tool invocations for orchestrator/i,
    });
    expect(within(completedRegion).getByText(/spawn_subagent/i)).toBeInTheDocument();

    const contextToggle = await screen.findByRole("button", {
      name: /toggle context bundles for orchestrator/i,
    });
    await user.click(contextToggle);
    const contextMatches = await screen.findAllByText(/Research context/i);
    expect(contextMatches.length).toBeGreaterThan(0);

    const subagentsToggle = await screen.findByRole("button", {
      name: /toggle spawned agents for orchestrator/i,
    });
    await user.click(subagentsToggle);
    expect(
      await screen.findByRole("button", { name: /select Research Analyst agent/i }),
    ).toBeInTheDocument();

    await act(async () => {
      toolCallHandlers.forEach((handler) =>
        handler({
          sessionId: "session-1",
          id: "call-research",
          name: "search_docs",
          agentId: "agent-researcher",
          arguments: { query: "Latest TypeScript release" },
          timestamp: "2024-05-01T12:00:20.000Z",
        }),
      );
    });

    const researchToggle = await screen.findByRole("button", {
      name: /toggle running tool invocations for Research Analyst/i,
    });
    await user.click(researchToggle);

    const researchRegion = await screen.findByRole("region", {
      name: /running tool invocations for Research Analyst/i,
    });
    expect(within(researchRegion).getByText(/search_docs/i)).toBeInTheDocument();
    expect(within(researchRegion).getByText(/Latest TypeScript release/i)).toBeInTheDocument();
  });

  it("keeps tool invocations grouped when result payload omits agent identifier", async () => {
    const user = userEvent.setup();
    const handle = renderChatPage();

    await waitFor(() => expect(toolCallHandlers).toHaveLength(1));
    await waitFor(() => expect(toolResultHandlers).toHaveLength(1));

    await screen.findByRole("button", { name: /select orchestrator agent/i });

    await act(async () => {
      toolCallHandlers.forEach((handler) =>
        handler({
          sessionId: "session-1",
          id: "call-summary",
          name: "summarize_notes",
          agentId: "root-agent",
          arguments: { notes: "TypeScript 5.5 release" },
          timestamp: "2024-05-01T12:01:00.000Z",
        }),
      );
    });

    const runningToggle = await screen.findByRole("button", {
      name: /toggle running tool invocations for orchestrator/i,
    });
    await user.click(runningToggle);

    const runningRegion = await screen.findByRole("region", {
      name: /running tool invocations for orchestrator/i,
    });
    expect(within(runningRegion).getByText(/summarize_notes/i)).toBeInTheDocument();

    const getInvocation = () => {
      const metadata = handle.client.getQueryData([
        "orchestrator-metadata",
        "session-1",
      ]) as OrchestratorMetadataDto | null | undefined;
      return metadata?.toolInvocations?.find((entry) => entry.id === "call-summary");
    };

    const initialInvocation = getInvocation();
    expect(initialInvocation?.metadata?.agentId).toBe("root-agent");

    await act(async () => {
      toolResultHandlers.forEach((handler) =>
        handler({
          sessionId: "session-1",
          toolCallId: "call-summary",
          name: "summarize_notes",
          result: JSON.stringify({ summary: "Highlights compiled" }),
          timestamp: "2024-05-01T12:02:00.000Z",
        }),
      );
    });

    await waitFor(() => {
      const invocation = getInvocation();
      expect(invocation?.status).toBe("completed");
      expect(invocation?.metadata?.agentId).toBe("root-agent");
    });

    const completedToggle = await screen.findByRole("button", {
      name: /toggle completed tool invocations for orchestrator/i,
    });
    await user.click(completedToggle);

    const completedRegion = await screen.findByRole("region", {
      name: /completed tool invocations for orchestrator/i,
    });
    expect(within(completedRegion).getByText(/summarize_notes/i)).toBeInTheDocument();
    expect(
      within(completedRegion).getByText(/TypeScript 5.5 release/i),
    ).toBeInTheDocument();
  });
});
