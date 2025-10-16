import userEvent from "@testing-library/user-event";
import { QueryClient } from "@tanstack/react-query";
import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ChatMessageDto } from "@eddie/api-client";

import { createChatPageRenderer } from "./test-utils";

const catalogMock = vi.fn();
const listSessionsMock = vi.fn();
const listMessagesMock = vi.fn();
const createMessageMock = vi.fn();
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
  configurable: true,
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
    updatePreferences: updatePreferencesMock,
    isSyncing: false,
    isRemoteAvailable: true,
  }),
}));

vi.mock("@/auth/auth-context", async () => {
  const actual = await vi.importActual<typeof import("@/auth/auth-context")>(
    "@/auth/auth-context",
  );

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
        create: vi.fn(),
        get: vi.fn(),
        archive: vi.fn(),
        createMessage: createMessageMock,
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
      chatMessages: {
        onMessagePartial: vi.fn().mockReturnValue(() => {}),
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

describe("ChatPage composer interactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({ apiKey: "test-key", setApiKey: vi.fn() });
    updatePreferencesMock.mockReset();

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
    listMessagesMock.mockResolvedValue([]);
    getMetadataMock.mockResolvedValue({
      contextBundles: [],
      toolInvocations: [],
      agentHierarchy: [],
    });
    createMessageMock.mockResolvedValue({
      id: "message-1",
      sessionId: "session-1",
      role: "user",
      content: "Hello world",
      createdAt: timestamp,
    } satisfies ChatMessageDto);
  });

  it("submits the composer when pressing Alt+Enter", async () => {
    const user = userEvent.setup();
    renderChatPage();

    const composer = await screen.findByPlaceholderText(
      "Send a message to the orchestrator",
    );
    await user.type(composer, "Hello world");

    await user.keyboard("{Alt>}{Enter}{/Alt}");

    await waitFor(() => expect(createMessageMock).toHaveBeenCalledTimes(1));
    expect(createMessageMock).toHaveBeenCalledWith("session-1", {
      role: "user",
      content: "Hello world",
    });
  });
});
