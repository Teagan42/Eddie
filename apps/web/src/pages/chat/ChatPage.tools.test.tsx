import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Theme } from "@radix-ui/themes";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatPage } from "./ChatPage";

const listSessionsMock = vi.fn();
const listMessagesMock = vi.fn();
const getMetadataMock = vi.fn();
const catalogMock = vi.fn();

let toolCallHandler: ((payload: unknown) => void) | null = null;

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
        onMessageCreated: vi.fn().mockReturnValue(() => {}),
        onMessageUpdated: vi.fn().mockReturnValue(() => {}),
      },
      tools: {
        onToolCall: vi.fn((handler: (payload: unknown) => void) => {
          toolCallHandler = handler;
          return () => {};
        }),
        onToolResult: vi.fn().mockReturnValue(() => {}),
      },
    },
  }),
}));

vi.mock("./useChatMessagesRealtime", () => ({
  useChatMessagesRealtime: vi.fn(),
}));

describe("ChatPage tool metadata merging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toolCallHandler = null;

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
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <Theme>
        <QueryClientProvider client={client}>
          <ChatPage />
        </QueryClientProvider>
      </Theme>
    );

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
          metadata: {
            arguments: null,
          },
          children: [],
        },
      ],
    });

    await act(async () => {
      await client.refetchQueries({
        queryKey: ["orchestrator-metadata", "session-1"],
      });
    });

    await waitFor(() => {
      expect(screen.getByText("Args: query: cats")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.queryByText("Args: —")).not.toBeInTheDocument();
    });
  });
});
