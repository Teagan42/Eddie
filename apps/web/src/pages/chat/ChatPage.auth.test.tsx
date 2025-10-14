import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { act, screen, waitFor } from "@testing-library/react";
import { createChatPageRenderer } from "./test-utils";

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

vi.mock("@/auth/auth-context", async () => {
  const actual = await vi.importActual<
    typeof import("@/auth/auth-context")
      >("@/auth/auth-context");

  return {
    ...actual,
    useAuth: () => useAuthMock(),
  };
});

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
        onSessionDeleted: vi.fn().mockReturnValue(() => {}),
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

const renderChatPage = createChatPageRenderer(
  () =>
    new QueryClient({
      defaultOptions: { queries: { retry: false } },
    }),
);

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

  it("does not retry automatic session creation after failure without an API key change", async () => {
    let currentTime = Date.now();
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => currentTime);
    createSessionMock.mockRejectedValue(new Error("invalid key"));

    const view = renderChatPage();

    try {
      await waitFor(() => expect(createSessionMock).toHaveBeenCalledTimes(1));

      act(() => {
        currentTime += 31_000;
        view.rerender();
      });

      await waitFor(
        () => expect(createSessionMock).toHaveBeenCalledTimes(1),
        { timeout: 200 },
      );
    } finally {
      nowSpy.mockRestore();
      view.unmount();
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
