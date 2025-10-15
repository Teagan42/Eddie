import { act, screen, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { OrchestratorMetadataDto } from "@/api/orchestrator";

import { createChatPageRenderer } from "./test-utils";

const listSessionsMock = vi.fn();
const listMessagesMock = vi.fn();
const getMetadataMock = vi.fn();
const catalogMock = vi.fn();

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
        onToolCall: vi.fn().mockReturnValue(() => {}),
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

describe("ChatPage orchestrator metadata realtime cache updates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("keeps metadata-driven panels in sync with tool result events", async () => {
    renderChatPage();

    await waitFor(() => expect(getMetadataMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(toolResultHandler).toBeTypeOf("function"));

    expect(
      await screen.findByText("No context bundles associated yet."),
    ).toBeInTheDocument();
    expect(screen.getByText("Agent hierarchy")).toBeInTheDocument();
    expect(screen.getByText("Tool call tree")).toBeInTheDocument();

    await act(async () => {
      toolResultHandler?.({
        sessionId: "session-1",
        id: "call-1",
        name: "search",
        status: "completed",
        result: {
          contextBundles: [
            {
              id: "bundle-1",
              label: "Dataset A",
              summary: "Example dataset",
              fileCount: 1,
              sizeBytes: 512,
            },
          ],
          agentHierarchy: [
            {
              id: "agent-1",
              name: "Primary Agent",
              role: "coordinator",
              metadata: {},
              children: [],
            },
          ],
        },
      });
    });

    await waitFor(() => expect(screen.getByText("Dataset A")).toBeInTheDocument());
    await waitFor(() => expect(screen.getAllByText("Primary Agent").length).toBeGreaterThan(0));
  });

  it("refreshes metadata panels when the orchestrator request resolves with new data", async () => {
    const { client } = renderChatPage();

    await waitFor(() => expect(getMetadataMock).toHaveBeenCalledTimes(1));

    expect(
      await screen.findByText("No context bundles associated yet."),
    ).toBeInTheDocument();

    getMetadataMock.mockResolvedValueOnce({
      sessionId: "session-1",
      contextBundles: [
        {
          id: "bundle-2",
          label: "Dataset B",
          summary: "Another dataset",
          fileCount: 3,
          sizeBytes: 2048,
        },
      ],
      agentHierarchy: [
        {
          id: "agent-2",
          name: "Secondary Agent",
          role: "support",
          metadata: {},
          children: [],
        },
      ],
      toolInvocations: [],
    });

    await act(async () => {
      await client.refetchQueries({
        queryKey: ["orchestrator-metadata", "session-1"],
      });
    });

    await waitFor(() => expect(screen.getByText("Dataset B")).toBeInTheDocument());
    await waitFor(() => expect(screen.getAllByText("Secondary Agent").length).toBeGreaterThan(0));
  });

  it("honors empty orchestrator responses after realtime updates", async () => {
    const { client } = renderChatPage();

    await waitFor(() => expect(getMetadataMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(toolResultHandler).toBeTypeOf("function"));

    await act(async () => {
      toolResultHandler?.({
        sessionId: "session-1",
        id: "call-2",
        name: "browser.search",
        status: "completed",
        result: {},
      });
    });

    await waitFor(() => expect(screen.getAllByText("browser.search").length).toBeGreaterThan(0));

    getMetadataMock.mockResolvedValueOnce({
      sessionId: "session-1",
      contextBundles: [],
      agentHierarchy: [],
      toolInvocations: [],
    });

    await act(async () => {
      await client.refetchQueries({
        queryKey: ["orchestrator-metadata", "session-1"],
      });
    });

    await waitFor(() => expect(screen.queryByText("browser.search")).toBeNull());

    await waitFor(() =>
      expect(
        screen.getByText("No tool calls recorded for this session yet."),
      ).toBeInTheDocument(),
    );
  });

  it("syncs the orchestrator metadata query cache after realtime tool events", async () => {
    const { client } = renderChatPage();

    const queryKey = ["orchestrator-metadata", "session-1"] as const;

    await waitFor(() => expect(getMetadataMock).toHaveBeenCalledTimes(1));

    const initialMetadata = client.getQueryData<OrchestratorMetadataDto | null>(queryKey);
    expect(initialMetadata?.toolInvocations ?? []).toHaveLength(0);

    await act(async () => {
      toolResultHandler?.({
        sessionId: "session-1",
        id: "call-cache-1",
        name: "filesystem.read",
        status: "completed",
        result: {
          contextBundles: [],
          agentHierarchy: [],
        },
      });
    });

    await waitFor(() => {
      const updatedMetadata = client.getQueryData<OrchestratorMetadataDto | null>(queryKey);
      expect(updatedMetadata?.toolInvocations ?? []).not.toHaveLength(0);
    });
  });
});
