import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatPage } from "./ChatPage";

type ChatMessageDto = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  updatedAt: string;
};

const listSessionsMock = vi.fn();
const listMessagesMock = vi.fn();
const getMetadataMock = vi.fn();
const catalogMock = vi.fn();

class ResizeObserverMock {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

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
    },
  }),
}));

vi.mock("./useChatMessagesRealtime", () => ({
  useChatMessagesRealtime: vi.fn(() => ({
    messages: [],
    appendMessage: vi.fn(),
    updateMessage: vi.fn(),
  })),
}));

describe("ChatPage message surfaces", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    Object.defineProperty(globalThis, "ResizeObserver", {
      configurable: true,
      writable: true,
      value: ResizeObserverMock,
    });

    Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });

    const now = new Date().toISOString();
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

    const messages: ChatMessageDto[] = [
      {
        id: "message-1",
        role: "user",
        content: "First",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "message-2",
        role: "assistant",
        content: "Second",
        createdAt: now,
        updatedAt: now,
      },
    ];

    listMessagesMock.mockResolvedValue(messages);
    getMetadataMock.mockResolvedValue({
      contextBundles: [],
      toolInvocations: [],
      agentHierarchy: [],
    });
    catalogMock.mockResolvedValue([]);
  });

  it("renders darker, low-gradient surfaces for chat messages", async () => {
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

    await waitFor(() => expect(listMessagesMock).toHaveBeenCalledTimes(1));

    const messageContents = await screen.findAllByTestId("chat-message-content");
    const containersByRole = new Map(
      messageContents.map((element) => [
        element.getAttribute("data-chat-role"),
        element.parentElement as HTMLElement,
      ])
    );

    const userCard = containersByRole.get("user");
    const assistantCard = containersByRole.get("assistant");

    expect(userCard).toHaveClass("from-emerald-500/15");
    expect(userCard).toHaveClass("via-emerald-500/5");
    expect(userCard).toHaveClass("to-slate-950/70");

    expect(assistantCard).toHaveClass("from-sky-500/15");
    expect(assistantCard).toHaveClass("via-sky-500/5");
    expect(assistantCard).toHaveClass("to-slate-950/70");
  });
});
