import { act, screen, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createChatPageRenderer } from "./test-utils";

const listSessionsMock = vi.fn();
const listMessagesMock = vi.fn();
const getMetadataMock = vi.fn();
const getExecutionStateMock = vi.fn();
const catalogMock = vi.fn();

let agentActivityHandler:
  | ((payload: { sessionId: string; state: string }) => void)
  | null = null;

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
        getExecutionState: getExecutionStateMock,
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
        onAgentActivity: vi.fn(
          (handler: (payload: { sessionId: string; state: string }) => void) => {
            agentActivityHandler = handler;
            return () => {};
          }
        ),
      },
      tools: undefined,
    },
  }),
}));

vi.mock("./useChatMessagesRealtime", () => ({
  useChatMessagesRealtime: vi.fn(),
}));

const renderChatPage = createChatPageRenderer(() =>
  new QueryClient({
    defaultOptions: { queries: { retry: false } },
  }),
);

const expectIndicatorText = async (pattern: RegExp) => {
  await waitFor(() => {
    expect(screen.getByTestId("agent-activity-indicator")).toHaveTextContent(
      pattern
    );
  });
};

const waitForSessionsLoaded = async () => {
  await waitFor(() => {
    expect(listSessionsMock).toHaveBeenCalled();
  });
};

describe("ChatPage agent activity indicator", () => {
  const timestamp = new Date().toISOString();

  beforeEach(() => {
    vi.clearAllMocks();
    agentActivityHandler = null;

    getExecutionStateMock.mockResolvedValue(null);
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

  it("wraps ChatPage in an auth provider for test renders", () => {
    expect(() => renderChatPage()).not.toThrow();
  });

  it("reflects agent activity events for the active session", async () => {
    renderChatPage();

    await waitFor(() => {
      expect(agentActivityHandler).toBeTypeOf("function");
    });

    await waitForSessionsLoaded();

    await act(async () => {
      agentActivityHandler?.({ sessionId: "session-1", state: "thinking" });
    });

    await expectIndicatorText(/agent is thinking/i);

    await act(async () => {
      agentActivityHandler?.({ sessionId: "session-1", state: "tool" });
    });

    await expectIndicatorText(/calling tools/i);

    await act(async () => {
      agentActivityHandler?.({ sessionId: "session-1", state: "error" });
    });

    await expectIndicatorText(/agent run failed/i);

    await act(async () => {
      agentActivityHandler?.({ sessionId: "session-1", state: "idle" });
    });

    await waitFor(() => {
      expect(
        screen.queryByTestId("agent-activity-indicator")
      ).not.toBeInTheDocument();
    });
  });

  it("ignores activity events from other sessions", async () => {
    renderChatPage();

    await waitFor(() => {
      expect(agentActivityHandler).toBeTypeOf("function");
    });

    await waitForSessionsLoaded();

    await act(async () => {
      agentActivityHandler?.({ sessionId: "session-2", state: "thinking" });
    });

    await expect(
      screen.findByText(/agent is thinking/i, undefined, { timeout: 100 })
    ).rejects.toThrow();
  });
});
