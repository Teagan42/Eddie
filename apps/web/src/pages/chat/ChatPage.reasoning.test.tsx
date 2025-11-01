import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

    const indicator = await screen.findByTestId("agent-activity-indicator");
    expect(indicator).toHaveTextContent(/agent is thinking/i);

    const reasoning = await screen.findByTestId("chat-message-reasoning");
    expect(within(reasoning).getByText("Reasoning")).toBeVisible();
    expect(within(reasoning).getByText("Streaming")).toBeVisible();

    const segments = within(reasoning).getAllByTestId(
      "chat-message-reasoning-segment"
    );
    expect(segments).toHaveLength(1);
    expect(within(segments[0]!).getByText("Agent agent-42")).toBeVisible();
    expect(
      within(segments[0]!).getByText("Evaluating options")
    ).toBeVisible();

    const metadataUpdateTimestamp = new Date().toISOString();
    const expectedUpdatedTime = new Date(metadataUpdateTimestamp).toLocaleTimeString(
      [],
      { hour: "2-digit", minute: "2-digit" }
    );

    act(() => {
      reasoningPartialHandler?.({
        sessionId: "session-1",
        messageId: "message-1",
        text: "",
        metadata: { step: 2 },
        timestamp: metadataUpdateTimestamp,
        agentId: "agent-99",
      });
    });

    await waitFor(() => {
      const updatedSegments = within(reasoning).getAllByTestId(
        "chat-message-reasoning-segment"
      );
      expect(updatedSegments).toHaveLength(1);
      expect(
        within(updatedSegments[0]!).getByText("Agent agent-99")
      ).toBeVisible();
      expect(
        within(updatedSegments[0]!).getByText(expectedUpdatedTime)
      ).toBeVisible();
    });

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

    await waitFor(() => {
      const updatedSegments = within(reasoning).getAllByTestId(
        "chat-message-reasoning-segment"
      );
      expect(updatedSegments).toHaveLength(2);
      expect(
        within(updatedSegments[1]!).getByText("Ready to respond")
      ).toBeVisible();
    });

    expect(within(reasoning).getByText("Completed")).toBeVisible();
    expect(within(reasoning).queryByText("Streaming")).toBeNull();

    await waitFor(() => {
      expect(
        screen.queryByTestId("agent-activity-indicator")
      ).not.toBeInTheDocument();
    });
  });

  it("allows collapsing and expanding reasoning segments", async () => {
    const user = userEvent.setup();
    renderChatPage();

    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled());
    await waitFor(() => expect(reasoningPartialHandler).toBeDefined());

    const timestamp = new Date().toISOString();

    act(() => {
      reasoningPartialHandler?.({
        sessionId: "session-1",
        messageId: "message-1",
        text: "Considering approach",
        metadata: { step: 1 },
        timestamp,
        agentId: "agent-7",
      });
    });

    const reasoning = await screen.findByTestId("chat-message-reasoning");
    const segments = within(reasoning).getAllByTestId(
      "chat-message-reasoning-segment"
    );
    expect(segments).toHaveLength(1);

    const toggle = within(reasoning).getByRole("button", {
      name: /hide reasoning/i,
    });
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    await user.click(toggle);

    await waitFor(() => {
      expect(toggle).toHaveAttribute("aria-expanded", "false");
      expect(within(reasoning).queryByTestId("chat-message-reasoning-segment"))
        .not.toBeInTheDocument();
    });
    expect(toggle).toHaveTextContent(/show reasoning/i);

    await user.click(toggle);

    await waitFor(() => {
      expect(toggle).toHaveAttribute("aria-expanded", "true");
      expect(
        within(reasoning).getAllByTestId("chat-message-reasoning-segment")
      ).toHaveLength(1);
    });
  });
});
