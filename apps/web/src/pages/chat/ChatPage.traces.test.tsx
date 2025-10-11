import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import type { TraceDto } from "@eddie/api-client";
import { ChatPage } from "./ChatPage";

const catalogMock = vi.fn();
const listSessionsMock = vi.fn();
const listMessagesMock = vi.fn();
const getMetadataMock = vi.fn();

let traceCreatedHandler: ((trace: TraceDto) => void) | null = null;
let traceUpdatedHandler: ((trace: TraceDto) => void) | null = null;

function createChatSessionsSocketsMock() {
  return {
    onSessionCreated: vi.fn().mockReturnValue(() => {}),
    onSessionUpdated: vi.fn().mockReturnValue(() => {}),
    onMessageCreated: vi.fn().mockReturnValue(() => {}),
    onMessageUpdated: vi.fn().mockReturnValue(() => {}),
    onAgentActivity: vi.fn().mockReturnValue(() => {}),
  };
}

function createTracesSocketsMock() {
  return {
    onTraceCreated: vi.fn().mockImplementation((handler) => {
      traceCreatedHandler = handler;
      return () => {};
    }),
    onTraceUpdated: vi.fn().mockImplementation((handler) => {
      traceUpdatedHandler = handler;
      return () => {};
    }),
  };
}

const socketsMock: {
  chatSessions: ReturnType<typeof createChatSessionsSocketsMock>;
  traces?: ReturnType<typeof createTracesSocketsMock>;
} = {
  chatSessions: createChatSessionsSocketsMock(),
  traces: createTracesSocketsMock(),
};

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
    sockets: socketsMock,
  }),
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

describe("ChatPage tool call tree realtime updates", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    traceCreatedHandler = null;
    traceUpdatedHandler = null;

    socketsMock.chatSessions = createChatSessionsSocketsMock();
    socketsMock.traces = createTracesSocketsMock();

    const now = new Date().toISOString();
    catalogMock.mockResolvedValue([
      {
        name: "test-provider",
        label: "Test Provider",
        models: ["model-a"],
      },
    ]);
    listSessionsMock.mockResolvedValue([
      {
        id: "session-1",
        title: "Session 1",
        description: null,
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
    ]);
    listMessagesMock.mockResolvedValue([]);
    getMetadataMock.mockImplementation(async () => ({
      contextBundles: [],
      toolInvocations: [],
      agentHierarchy: [],
    }));
  });

  it("refetches orchestrator metadata when traces stream in for the active session", async () => {
    renderChatPage();

    await waitFor(() => expect(getMetadataMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(typeof traceCreatedHandler).toBe("function")
    );
    await waitFor(() =>
      expect(typeof traceUpdatedHandler).toBe("function")
    );

    traceCreatedHandler?.({
      id: "trace-1",
      sessionId: "session-1",
      name: "tool-call",
      status: "running",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await waitFor(() => expect(getMetadataMock).toHaveBeenCalledTimes(2));

    traceUpdatedHandler?.({
      id: "trace-1",
      sessionId: "session-1",
      name: "tool-call",
      status: "completed",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await waitFor(() => expect(getMetadataMock).toHaveBeenCalledTimes(3));
  });

  it("refetches orchestrator metadata when trace events omit a session id", async () => {
    renderChatPage();

    await waitFor(() => expect(getMetadataMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(typeof traceUpdatedHandler).toBe("function")
    );

    traceUpdatedHandler?.({
      id: "trace-2",
      name: "tool-call",
      status: "completed",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await waitFor(() => expect(getMetadataMock).toHaveBeenCalledTimes(2));
  });

  it("renders when the trace socket provider is missing", async () => {
    const originalTraces = socketsMock.traces;
    delete socketsMock.traces;

    try {
      expect(() => renderChatPage()).not.toThrow();

      await waitFor(() => expect(catalogMock).toHaveBeenCalledTimes(1));
    } finally {
      socketsMock.traces = originalTraces;
    }
  });
});
