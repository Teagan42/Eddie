import { act, screen, waitFor, within } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ChatMessageDto } from "@eddie/api-client";

import { createChatPageRenderer } from "./test-utils";

const catalogMock = vi.fn();
const listSessionsMock = vi.fn();
const listMessagesMock = vi.fn();
const getMetadataMock = vi.fn();
const getExecutionStateMock = vi.fn();
const loadConfigMock = vi.fn();

let reasoningPartialHandler:
  | ((payload: {
      sessionId: string;
      messageId: string;
      text: string;
      metadata?: Record<string, unknown>;
      timestamp?: string;
      agentId?: string | null;
    }) => void)
  | undefined;

let reasoningCompleteHandler:
  | ((payload: {
      sessionId: string;
      messageId: string;
      responseId?: string;
      text?: string;
      metadata?: Record<string, unknown>;
      timestamp?: string;
      agentId?: string | null;
    }) => void)
  | undefined;

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
        getExecutionState: getExecutionStateMock,
      },
      config: {
        loadEddieConfig: loadConfigMock,
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
      chatMessages: {
        onMessagePartial: vi.fn().mockReturnValue(() => {}),
        onReasoningPartial: vi.fn(
          (
            handler: (payload: {
              sessionId: string;
              messageId: string;
              text: string;
              metadata?: Record<string, unknown>;
              timestamp?: string;
              agentId?: string | null;
            }) => void,
          ) => {
            reasoningPartialHandler = handler;
            return () => {};
          }
        ),
        onReasoningComplete: vi.fn(
          (
            handler: (payload: {
              sessionId: string;
              messageId: string;
              responseId?: string;
              text?: string;
              metadata?: Record<string, unknown>;
              timestamp?: string;
              agentId?: string | null;
            }) => void,
          ) => {
            reasoningCompleteHandler = handler;
            return () => {};
          }
        ),
      },
    },
  }),
}));

const renderChatPage = createChatPageRenderer(
  () =>
    new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
);

describe("ChatPage reasoning updates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reasoningPartialHandler = undefined;
    reasoningCompleteHandler = undefined;
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });

    const timestamp = new Date().toISOString();
    catalogMock.mockResolvedValue([]);
    loadConfigMock.mockResolvedValue({
      path: null,
      format: "yaml" as const,
      content: "",
      input: {},
      config: {
        providers: {
          "profile-openai": {
            provider: { name: "openai" },
            model: "gpt-4.1",
          },
        },
      },
      error: null,
    });
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
    listMessagesMock.mockResolvedValue([
      {
        id: "message-1",
        sessionId: "session-1",
        role: "assistant",
        content: "Initial response",
        createdAt: timestamp,
      } as ChatMessageDto,
    ]);
    getMetadataMock.mockResolvedValue({
      contextBundles: [],
      toolInvocations: [],
      agentHierarchy: [],
    });
    getExecutionStateMock.mockResolvedValue(null);
  });

  it("renders reasoning content from realtime events", async () => {
    renderChatPage();

    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled());
    await waitFor(() => expect(reasoningPartialHandler).toBeDefined());

    const partialTimestamp = new Date().toISOString();

    act(() => {
      reasoningPartialHandler?.({
        sessionId: "session-1",
        messageId: "message-1",
        text: "Evaluating options",
        metadata: { step: 1 },
        timestamp: partialTimestamp,
        agentId: "agent-42",
      });
    });

    const reasoning = await screen.findByTestId("chat-message-reasoning");
    expect(within(reasoning).getByText("Reasoning")).toBeVisible();
    expect(within(reasoning).getByText("Streaming")).toBeVisible();
    expect(within(reasoning).getByText("Evaluating options")).toBeVisible();
    expect(within(reasoning).getByText("Agent agent-42")).toBeVisible();

    const completionTimestamp = new Date().toISOString();

    act(() => {
      reasoningCompleteHandler?.({
        sessionId: "session-1",
        messageId: "message-1",
        text: "Ready to respond",
        responseId: "resp-1",
        metadata: { step: 2 },
        timestamp: completionTimestamp,
        agentId: "agent-42",
      });
    });

    await waitFor(() =>
      expect(within(reasoning).getByText("Ready to respond")).toBeVisible()
    );

    expect(within(reasoning).getByText("Completed")).toBeVisible();
    expect(within(reasoning).queryByText("Streaming")).toBeNull();
  });
});
