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

Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
  value: vi.fn(),
  configurable: true,
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

function renderChatPage(): QueryClient {
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

  return client;
}

describe("ChatPage agent activity indicator", () => {
  const timestamp = new Date().toISOString();

  beforeEach(() => {
    vi.clearAllMocks();
    toolCallHandler = null;

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

  it("shows a thinking indicator while awaiting an assistant response", async () => {
    listMessagesMock.mockResolvedValueOnce([
      {
        id: "message-1",
        sessionId: "session-1",
        role: "user",
        content: "Hello?",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ]);

    renderChatPage();

    await waitFor(() => {
      expect(screen.getByTestId("agent-activity-indicator")).toBeInTheDocument();
    });

    expect(screen.getByText(/agent is thinking/i)).toBeInTheDocument();
  });

  it("announces when tools are running", async () => {
    renderChatPage();

    await waitFor(() => {
      expect(toolCallHandler).toBeTypeOf("function");
    });

    await act(async () => {
      toolCallHandler?.({
        sessionId: "session-1",
        id: "call-1",
        name: "search",
        status: "running",
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/calling tools/i)).toBeInTheDocument();
    });
  });

  it("indicates when the run fails", async () => {
    renderChatPage();

    await waitFor(() => {
      expect(toolCallHandler).toBeTypeOf("function");
    });

    await act(async () => {
      toolCallHandler?.({
        sessionId: "session-1",
        id: "call-1",
        name: "search",
        status: "failed",
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/agent run failed/i)).toBeInTheDocument();
    });
  });
});
