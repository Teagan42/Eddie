import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import { AuthProvider } from "@/auth/auth-context";
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
  writable: true,
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
        onAgentActivity: vi.fn().mockReturnValue(() => {}),
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
    </Theme>,
  );
}

describe("ChatPage sidebar accessibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const now = new Date().toISOString();

    catalogMock.mockResolvedValue([]);
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
    getMetadataMock.mockResolvedValue({
      contextBundles: [],
      toolInvocations: [],
      agentHierarchy: [],
    });
  });

  it("uses solid variant collapse toggles for higher contrast", async () => {
    renderChatPage();

    await waitFor(() => expect(listSessionsMock).toHaveBeenCalled());

    const collapseButtons = await screen.findAllByRole("button", {
      name: "Collapse panel",
    });

    expect(collapseButtons.length).toBeGreaterThan(0);
    for (const button of collapseButtons) {
      expect(button).toHaveClass("rt-variant-solid");
    }
  });

  it("renders chat messages with high-contrast text", async () => {
    const timestamp = new Date().toISOString();
    listMessagesMock.mockResolvedValueOnce([
      {
        id: "message-1",
        sessionId: "session-1",
        role: "assistant",
        content: "Hello contrast",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ]);

    renderChatPage();

    const messageContent = await screen.findByTestId("chat-message-content");

    expect(messageContent).toHaveClass("text-white/95");
    expect(messageContent).toHaveClass("text-base");
  });

  it("scales sidebar panels responsively for larger viewports", async () => {
    renderChatPage();

    const heading = await screen.findByRole("heading", { name: "Context bundles" });
    const column = heading.closest("section")?.parentElement;

    if (!column) {
      throw new Error("Sidebar column container not found");
    }

    expect(column).toHaveClass("lg:w-[22rem]");
    expect(column).toHaveClass("xl:w-[26rem]");
    expect(column).toHaveClass("2xl:w-[30rem]");
  });
});
