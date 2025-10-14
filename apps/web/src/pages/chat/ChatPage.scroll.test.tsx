import { act, screen, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ChatMessageDto } from "@eddie/api-client";

import { createChatPageRenderer } from "./test-utils";

class ResizeObserverMock {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

Object.defineProperty(globalThis, "ResizeObserver", {
  value: ResizeObserverMock,
});

const catalogMock = vi.fn();
const listSessionsMock = vi.fn();
const listMessagesMock = vi.fn();
const getMetadataMock = vi.fn();
const onSessionCreatedMock = vi.fn().mockImplementation(() => () => {});
const onSessionUpdatedMock = vi.fn().mockImplementation(() => () => {});
const onMessageCreatedMock = vi.fn().mockImplementation(() => () => {});
const onMessageUpdatedMock = vi.fn().mockImplementation(() => () => {});
let messagePartialHandler: ((message: ChatMessageDto) => void) | undefined;
const onMessagePartialMock = vi.fn().mockImplementation(
  (handler: (message: ChatMessageDto) => void) => {
    messagePartialHandler = handler;
    return () => {};
  }
);

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
        onSessionCreated: onSessionCreatedMock,
        onSessionUpdated: onSessionUpdatedMock,
        onSessionDeleted: vi.fn().mockReturnValue(() => {}),
        onMessageCreated: onMessageCreatedMock,
        onMessageUpdated: onMessageUpdatedMock,
        onAgentActivity: vi.fn().mockReturnValue(() => {}),
      },
      chatMessages: {
        onMessagePartial: onMessagePartialMock,
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

describe("ChatPage message scrolling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    messagePartialHandler = undefined;
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
    const timestamp = new Date().toISOString();
    catalogMock.mockResolvedValue([]);
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
      },
    ]);
    getMetadataMock.mockResolvedValue({
      contextBundles: [],
      toolInvocations: [],
      agentHierarchy: [],
    });
  });

  it("scrolls to the newest message when a partial update arrives", async () => {
    renderChatPage();

    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled());
    await waitFor(() => expect(onMessagePartialMock).toHaveBeenCalled());

    const scrollAnchor = await screen.findByTestId("chat-scroll-anchor");
    const scrollIntoView = vi.fn();
    Object.defineProperty(scrollAnchor, "scrollIntoView", {
      configurable: true,
      writable: true,
      value: scrollIntoView,
    });
    scrollIntoView.mockClear();

    act(() => {
      messagePartialHandler?.({
        id: "message-1",
        sessionId: "session-1",
        role: "assistant",
        content: "Initial response with more content",
        createdAt: new Date().toISOString(),
      });
    });

    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
  });
});
