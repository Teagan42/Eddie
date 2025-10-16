import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildToolInvocationFixture, createChatPageRenderer } from "./test-utils";
import type { OrchestratorMetadataDto } from "@eddie/api-client";

const listSessionsMock = vi.fn();
const listMessagesMock = vi.fn();
const getMetadataMock = vi.fn();
const catalogMock = vi.fn();

let toolCallHandler: ((payload: unknown) => void) | null = null;
let toolResultHandler: ((payload: unknown) => void) | null = null;

class ResizeObserverMock {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

Object.defineProperty(globalThis, "ResizeObserver", {
  value: ResizeObserverMock,
});

vi.mock("@/hooks/useLayoutPreferences", () => ({
  useLayoutPreferences: () => ({
    preferences: {
      chat: {
        selectedSessionId: "session-1",
        sessionSettings: {},
        collapsedPanels: {},
        templates: {},
      },
    },
    updatePreferences: vi.fn(),
    isSyncing: false,
    isRemoteAvailable: true,
  }),
}));

vi.mock("@/api/api-provider", () => ({
  useApi: () => ({
    http: {
      chatSessions: {
        list: listSessionsMock,
        listMessages: listMessagesMock,
        create: vi.fn(),
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
      tools: {
        onToolCall: vi.fn((handler: (payload: unknown) => void) => {
          toolCallHandler = handler;
          return () => {};
        }),
        onToolResult: vi.fn((handler: (payload: unknown) => void) => {
          toolResultHandler = handler;
          return () => {};
        }),
      },
    },
  }),
}));

vi.mock("./useChatMessagesRealtime", () => ({
  useChatMessagesRealtime: vi.fn(),
}));

const renderChatPage = createChatPageRenderer(
  () =>
    new QueryClient({
      defaultOptions: { queries: { retry: false } },
    }),
);

describe("ChatPage tool metadata merging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toolCallHandler = null;
    toolResultHandler = null;

    const timestamp = new Date().toISOString();
    listSessionsMock.mockResolvedValue([
      {
        id: "session-1",
        title: "Session 1",
        description: null,
        status: "active",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ]);
    listMessagesMock.mockResolvedValue([]);
    catalogMock.mockResolvedValue([]);
    getMetadataMock.mockResolvedValue({
      sessionId: "session-1",
      contextBundles: [],
      toolInvocations: [],
      agentHierarchy: [],
    });
  });

  it("keeps existing metadata when snapshot provides null fields", async () => {
    const { client } = renderChatPage();

    await waitFor(() => expect(listSessionsMock).toHaveBeenCalledTimes(1));
    expect(toolCallHandler).toBeTypeOf("function");

    await act(async () => {
      toolCallHandler?.({
        sessionId: "session-1",
        id: "call-1",
        name: "search",
        status: "running",
        arguments: "query: cats",
      });
    });

    await waitFor(() => {
      expect(screen.getByText("Args: query: cats")).toBeInTheDocument();
    });

    getMetadataMock.mockResolvedValueOnce({
      sessionId: "session-1",
      contextBundles: [],
      agentHierarchy: [],
      toolInvocations: [
        {
          id: "call-1",
          name: "search",
          status: "running",
          metadata: null,
          children: [],
        },
      ],
    });

    await act(async () => {
      await client.refetchQueries({
        queryKey: ["orchestrator-metadata", "session-1"],
      });
    });

    const toolCardButton = screen.getByRole("button", {
      name: /view search tool call details/i,
    });
    const toolCard = toolCardButton.closest("li");
    expect(toolCard).toBeInstanceOf(HTMLElement);

    await waitFor(() => {
      expect(within(toolCard as HTMLElement).getByText("Args: query: cats")).toBeInTheDocument();
      expect(within(toolCard as HTMLElement).queryByText("Args: —")).not.toBeInTheDocument();
    });

    await waitFor(() => {
      const snapshot = client.getQueryData<OrchestratorMetadataDto | null>([
        "orchestrator-metadata",
        "session-1",
      ]);
      expect(snapshot?.toolInvocations?.[0]?.metadata?.arguments).toBe("query: cats");
    });
  });

  it("merges orchestrator metadata from realtime tool events", async () => {
    const user = userEvent.setup();
    const timestamp = new Date().toISOString();

    renderChatPage();

    await waitFor(() => expect(toolCallHandler).toBeTypeOf("function"));
    await waitFor(() => expect(toolResultHandler).toBeTypeOf("function"));

    const toolPanelHeading = await screen.findByRole("heading", { name: /tool call tree/i });
    const toolPanel = toolPanelHeading.closest("section");
    expect(toolPanel).toBeInstanceOf(HTMLElement);
    const toolPanelQueries = within(toolPanel as HTMLElement);

    await act(async () => {
      toolCallHandler?.({
        sessionId: "session-1",
        id: "call-1",
        orchestratorMetadata: {
          sessionId: "session-1",
          contextBundles: [],
          agentHierarchy: [],
          toolInvocations: [
            {
              id: "call-1",
              name: "plan",
              status: "running",
              metadata: { createdAt: timestamp },
              children: [
                {
                  id: "child-1",
                  name: "search",
                  status: "running",
                  metadata: { createdAt: timestamp },
                  children: [],
                },
              ],
            },
          ],
        },
      });
    });

    await waitFor(() => expect(toolPanelQueries.getByText("plan")).toBeInTheDocument());

    const toggleButton = toolPanelQueries.getByRole("button", {
      name: /toggle plan children/i,
    });
    await user.click(toggleButton);

    await waitFor(() => expect(toolPanelQueries.getByText("search")).toBeInTheDocument());

    await act(async () => {
      toolResultHandler?.({
        sessionId: "session-1",
        id: "call-1",
        orchestratorMetadata: {
          sessionId: "session-1",
          contextBundles: [],
          agentHierarchy: [],
          toolInvocations: [
            {
              id: "call-1",
              name: "plan",
              status: "completed",
              metadata: {
                createdAt: timestamp,
                result: "metadata result",
              },
              children: [],
            },
          ],
        },
      });
    });

    await waitFor(() => expect(toolPanelQueries.getByText("COMPLETED")).toBeInTheDocument());
    await waitFor(() =>
      expect(toolPanelQueries.getByText("Result: metadata result")).toBeInTheDocument(),
    );
  });

  it("filters tool tree to the selected agent lineage until toggled off", async () => {
    const user = userEvent.setup();
    const timestamp = new Date().toISOString();

    const agentHierarchy = [
      {
        id: "root-agent",
        name: "orchestrator",
        provider: "openai",
        model: "gpt-4o",
        depth: 0,
        metadata: { messageCount: 3 },
        children: [
          {
            id: "child-agent",
            name: "scout",
            provider: "anthropic",
            model: "claude-3.5",
            depth: 1,
            metadata: { messageCount: 2 },
            children: [],
          },
          {
            id: "sibling-agent",
            name: "watcher",
            provider: "openai",
            model: "gpt-4o-mini",
            depth: 1,
            metadata: { messageCount: 1 },
            children: [],
          },
        ],
      },
    ];

    const toolInvocations = [
      buildToolInvocationFixture({
        id: "root-call",
        name: "plan",
        status: "completed",
        agentId: "root-agent",
        metadata: {
          createdAt: timestamp,
          arguments: "{}",
          result: "ok",
        },
        children: [
          {
            id: "child-call",
            name: "search",
            status: "completed",
            agentId: "child-agent",
            metadata: {
              createdAt: timestamp,
              arguments: "{}",
              result: "ok",
            },
          },
        ],
      }),
      buildToolInvocationFixture({
        id: "sibling-call",
        name: "summarize",
        status: "completed",
        agentId: "sibling-agent",
        metadata: {
          createdAt: timestamp,
          arguments: "{}",
          result: "ok",
        },
      }),
    ];

    getMetadataMock.mockResolvedValueOnce({
      sessionId: "session-1",
      contextBundles: [],
      toolInvocations,
      agentHierarchy,
    });

    renderChatPage();

    const toolPanelHeading = await screen.findByRole("heading", { name: /tool call tree/i });
    const toolPanel = toolPanelHeading.closest("section");
    expect(toolPanel).toBeInstanceOf(HTMLElement);
    const toolPanelQueries = within(toolPanel as HTMLElement);

    await waitFor(() => {
      expect(getMetadataMock).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(
        toolPanelQueries.queryByText(/no tool calls recorded for this session yet\./i),
      ).not.toBeInTheDocument();
    });

    const toggleChildAgents = toolPanelQueries.getByRole("button", {
      name: /toggle orchestrator agents/i,
    });
    await user.click(toggleChildAgents);

    await waitFor(() => {
      expect(toolPanelQueries.getByText("orchestrator")).toBeInTheDocument();
      expect(toolPanelQueries.getByText("scout")).toBeInTheDocument();
      expect(toolPanelQueries.getByText("watcher")).toBeInTheDocument();
    });

    const agentPanelHeading = screen.getByRole("heading", { name: /agent hierarchy/i });
    const agentPanel = agentPanelHeading.closest("section");
    expect(agentPanel).toBeInstanceOf(HTMLElement);
    const scoutButton = within(agentPanel as HTMLElement).getByRole("button", {
      name: /select scout agent/i,
    });

    await user.click(scoutButton);

    await waitFor(() => {
      expect(toolPanelQueries.getByText("orchestrator")).toBeInTheDocument();
      expect(toolPanelQueries.getByText("scout")).toBeInTheDocument();
      expect(toolPanelQueries.queryByText("watcher")).not.toBeInTheDocument();
    });

    await user.click(scoutButton);

    await waitFor(() => {
      expect(toolPanelQueries.getByText("watcher")).toBeInTheDocument();
    });
  });
});
