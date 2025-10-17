import userEvent from "@testing-library/user-event";
import { QueryClient } from "@tanstack/react-query";
import { act, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatSessionDto } from "@eddie/api-client";
import { createChatPageRenderer } from "./test-utils";

const toolCallHandlers: Array<(payload: any) => void> = [];
const toolResultHandlers: Array<(payload: any) => void> = [];

const sessionCreatedHandlers: Array<(session: ChatSessionDto) => void> = [];
const sessionUpdatedHandlers: Array<(session: ChatSessionDto) => void> = [];
const sessionDeletedHandlers: Array<(sessionId: string) => void> = [];
const messageCreatedHandlers: Array<(message: any) => void> = [];
const messageUpdatedHandlers: Array<(message: any) => void> = [];

const catalogMock = vi.fn();
const listSessionsMock = vi.fn();
const listMessagesMock = vi.fn();
const getMetadataMock = vi.fn();

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
        onSessionCreated: vi.fn((handler: (session: ChatSessionDto) => void) => {
          sessionCreatedHandlers.push(handler);
          return () => {
            const index = sessionCreatedHandlers.indexOf(handler);
            if (index >= 0) {
              sessionCreatedHandlers.splice(index, 1);
            }
          };
        }),
        onSessionUpdated: vi.fn((handler: (session: ChatSessionDto) => void) => {
          sessionUpdatedHandlers.push(handler);
          return () => {
            const index = sessionUpdatedHandlers.indexOf(handler);
            if (index >= 0) {
              sessionUpdatedHandlers.splice(index, 1);
            }
          };
        }),
        onSessionDeleted: vi.fn((handler: (sessionId: string) => void) => {
          sessionDeletedHandlers.push(handler);
          return () => {
            const index = sessionDeletedHandlers.indexOf(handler);
            if (index >= 0) {
              sessionDeletedHandlers.splice(index, 1);
            }
          };
        }),
        onMessageCreated: vi.fn((handler: (message: unknown) => void) => {
          messageCreatedHandlers.push(handler);
          return () => {
            const index = messageCreatedHandlers.indexOf(handler);
            if (index >= 0) {
              messageCreatedHandlers.splice(index, 1);
            }
          };
        }),
        onMessageUpdated: vi.fn((handler: (message: unknown) => void) => {
          messageUpdatedHandlers.push(handler);
          return () => {
            const index = messageUpdatedHandlers.indexOf(handler);
            if (index >= 0) {
              messageUpdatedHandlers.splice(index, 1);
            }
          };
        }),
        onAgentActivity: vi.fn().mockReturnValue(() => {}),
      },
      tools: {
        onToolCall: vi.fn((handler: (payload: unknown) => void) => {
          toolCallHandlers.push(handler);
          return () => {
            const index = toolCallHandlers.indexOf(handler);
            if (index >= 0) {
              toolCallHandlers.splice(index, 1);
            }
          };
        }),
        onToolResult: vi.fn((handler: (payload: unknown) => void) => {
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

vi.mock("@/vendor/hooks/use-toast", () => ({
  toast: vi.fn(),
  useToast: () => ({
    toast: vi.fn(),
    dismiss: vi.fn(),
    toasts: [],
  }),
}));

const renderChatPage = createChatPageRenderer(
  () =>
    new QueryClient({
      defaultOptions: { queries: { retry: false } },
    }),
);

describe("ChatPage tool invocation realtime updates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toolCallHandlers.length = 0;
    toolResultHandlers.length = 0;
    sessionCreatedHandlers.length = 0;
    sessionUpdatedHandlers.length = 0;
    sessionDeletedHandlers.length = 0;
    messageCreatedHandlers.length = 0;
    messageUpdatedHandlers.length = 0;

    const now = new Date().toISOString();

    catalogMock.mockResolvedValue([]);
    listSessionsMock.mockResolvedValue([
      {
        id: "session-1",
        title: "Session 1",
        description: "",
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
    ]);
    listMessagesMock.mockResolvedValue([]);
    getMetadataMock.mockResolvedValue({
      sessionId: "session-1",
      contextBundles: [],
      agentHierarchy: [
        {
          id: "root-agent",
          name: "orchestrator",
          provider: "openai",
          model: "gpt-4o",
          depth: 0,
          metadata: {},
          children: [],
        },
      ],
      toolInvocations: [],
    });
  });

  it("moves tool invocations between status groups as realtime events arrive", async () => {
    const user = userEvent.setup();
    renderChatPage();

    await waitFor(() => expect(getMetadataMock).toHaveBeenCalled());
    await waitFor(() => expect(toolCallHandlers).not.toHaveLength(0));
    await waitFor(() => expect(toolResultHandlers).not.toHaveLength(0));

    expect(
      screen.queryByRole("button", {
        name: /running tool invocations for orchestrator/i,
      }),
    ).not.toBeInTheDocument();

    const callPayload = {
      sessionId: "session-1",
      id: "tool-1",
      name: "search-web",
      arguments: { query: "Lunch spots" },
      timestamp: "2024-05-01T12:00:00.000Z",
      agentId: "root-agent",
      status: "pending" as const,
    };

    act(() => {
      toolCallHandlers.forEach((handler) => handler(callPayload));
    });

    const pendingToggle = await screen.findByRole("button", {
      name: /pending tool invocations for orchestrator/i,
    });

    await user.click(pendingToggle);

    const pendingRegion = await screen.findByRole("region", {
      name: /pending tool invocations for orchestrator/i,
    });

    expect(within(pendingRegion).getByText(/search-web/i)).toBeInTheDocument();

    const resultPayload = {
      sessionId: "session-1",
      id: "tool-1",
      name: "search-web",
      result: { summary: "Booked table" },
      timestamp: "2024-05-01T12:01:00.000Z",
      agentId: "root-agent",
      status: "completed",
    };

    act(() => {
      toolResultHandlers.forEach((handler) => handler(resultPayload));
    });

    await waitFor(() =>
      expect(
        screen.queryByRole("button", {
          name: /pending tool invocations for orchestrator/i,
        }),
      ).not.toBeInTheDocument(),
    );

    const completedToggle = await screen.findByRole("button", {
      name: /completed tool invocations for orchestrator/i,
    });

    await user.click(completedToggle);

    const completedRegion = await screen.findByRole("region", {
      name: /completed tool invocations for orchestrator/i,
    });

    expect(within(completedRegion).getByText(/search-web/i)).toBeInTheDocument();
  });
});
