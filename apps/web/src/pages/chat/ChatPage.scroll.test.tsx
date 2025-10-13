import { act, render, screen, waitFor } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "@/auth/auth-context";

import type { ChatMessageDto } from "@eddie/api-client";

import { ChatPage } from "./ChatPage";

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

function renderChatPage(): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <Theme>
      <AuthProvider>
        <QueryClientProvider client={client}>
          <ChatPage />
        </QueryClientProvider>
      </AuthProvider>
    </Theme>
  );
}

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
