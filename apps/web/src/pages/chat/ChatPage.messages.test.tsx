import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import type { ChatMessageDto } from "@eddie/api-client";
import { ChatPage } from "./ChatPage";

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
    },
  }),
}));

function renderChatPage(): void {
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
}

describe("ChatPage message roles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    getMetadataMock.mockResolvedValue({
      contextBundles: [],
      toolInvocations: [],
      agentHierarchy: [],
    });
  });

  it("renders fallback styling for messages with unknown roles", async () => {
    const timestamp = new Date().toISOString();
    const toolMessage = {
      id: "message-1",
      sessionId: "session-1",
      role: "tool",
      content: "Tool output ready",
      createdAt: timestamp,
    } as unknown as ChatMessageDto;

    listMessagesMock.mockResolvedValue([toolMessage]);

    renderChatPage();

    await waitFor(() => expect(listMessagesMock).toHaveBeenCalled());

    expect(
      await screen.findByText("Tool output ready")
    ).toBeInTheDocument();
    expect(await screen.findByText("Tool")).toBeInTheDocument();
  });
});
