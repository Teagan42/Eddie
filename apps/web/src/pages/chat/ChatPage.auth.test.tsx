import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import { ChatPage } from "./ChatPage";

const catalogMock = vi.fn();
const listSessionsMock = vi.fn();
const listMessagesMock = vi.fn();
const createSessionMock = vi.fn();
const getMetadataMock = vi.fn();
const useAuthMock = vi.fn();
const updatePreferencesMock = vi.fn();

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

vi.mock("@/hooks/useLayoutPreferences", () => {
  return {
    useLayoutPreferences: () => ({
      preferences: {
        chat: {
          selectedSessionId: null,
          sessionSettings: {},
          collapsedPanels: {},
          templates: {},
        },
      },
      updatePreferences: updatePreferencesMock,
      isSyncing: false,
      isRemoteAvailable: true,
    }),
  };
});

vi.mock("@/auth/auth-context", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/api/api-provider", () => ({
  useApi: () => ({
    http: {
      chatSessions: {
        list: listSessionsMock,
        listMessages: listMessagesMock,
        create: createSessionMock,
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

vi.mock("./useChatMessagesRealtime", () => ({
  useChatMessagesRealtime: vi.fn(),
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
    </Theme>,
  );
}

describe("ChatPage authentication behaviours", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReset();
    updatePreferencesMock.mockReset();

    const timestamp = new Date().toISOString();

    useAuthMock.mockReturnValue({ apiKey: "test-key", setApiKey: vi.fn() });
    catalogMock.mockResolvedValue([]);
    listSessionsMock.mockResolvedValue([]);
    listMessagesMock.mockResolvedValue([]);
    getMetadataMock.mockResolvedValue({
      contextBundles: [],
      toolInvocations: [],
      agentHierarchy: [],
    });
    createSessionMock.mockResolvedValue({
      id: "session-auto",
      title: "New orchestrator session",
      description: "",
      status: "active",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  });

  it("creates and selects a session when an API key is present and none exist", async () => {
    renderChatPage();

    await waitFor(() => expect(createSessionMock).toHaveBeenCalledTimes(1));

    expect(createSessionMock).toHaveBeenCalledWith({
      title: "New orchestrator session",
      description: "",
    });

    const sessionButton = await screen.findByRole("button", {
      name: "New orchestrator session",
    });

    expect(sessionButton).toHaveClass("rt-variant-solid");
  });

  it("stops auto session creation retries after a failure", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    createSessionMock.mockRejectedValue(new Error("invalid key"));

    try {
      renderChatPage();

      await waitFor(() => expect(createSessionMock).toHaveBeenCalledTimes(1));

      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(createSessionMock).toHaveBeenCalledTimes(1);
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("disables the composer when no API key is available", async () => {
    const timestamp = new Date().toISOString();
    useAuthMock.mockReturnValue({ apiKey: null, setApiKey: vi.fn() });
    listSessionsMock.mockResolvedValueOnce([
      {
        id: "session-1",
        title: "Session 1",
        description: null,
        status: "active",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ]);

    renderChatPage();

    await waitFor(() => expect(listSessionsMock).toHaveBeenCalled());

    expect(createSessionMock).not.toHaveBeenCalled();

    const composer = await screen.findByPlaceholderText(
      "Send a message to the orchestrator",
    );
    const sendButton = await screen.findByRole("button", { name: "Send" });

    expect(composer).toBeDisabled();
    expect(sendButton).toBeDisabled();
  });
});
