import userEvent from "@testing-library/user-event";
import { QueryClient } from "@tanstack/react-query";
import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createChatPageRenderer } from "./test-utils";

const sessionCreatedHandlers: Array<(session: unknown) => void> = [];

const catalogMock = vi.fn();
const listSessionsMock = vi.fn();
const listMessagesMock = vi.fn();
const createSessionMock = vi.fn();
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
        onSessionCreated: vi.fn((handler: (session: unknown) => void) => {
          sessionCreatedHandlers.push(handler);
          return () => {
            const index = sessionCreatedHandlers.indexOf(handler);
            if (index >= 0) {
              sessionCreatedHandlers.splice(index, 1);
            }
          };
        }),
        onSessionUpdated: vi.fn().mockReturnValue(() => {}),
        onSessionDeleted: vi.fn().mockReturnValue(() => {}),
        onMessageCreated: vi.fn().mockReturnValue(() => {}),
        onMessageUpdated: vi.fn().mockReturnValue(() => {}),
        onAgentActivity: vi.fn().mockReturnValue(() => {}),
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

describe("ChatPage session creation", () => {
  const buildSessionDto = (id: string, title: string, timestamp: string) => ({
    id,
    title,
    description: "",
    status: "active" as const,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    sessionCreatedHandlers.length = 0;

    const now = new Date().toISOString();

    catalogMock.mockResolvedValue([]);
    listSessionsMock.mockResolvedValue([
      {
        id: "session-1",
        title: "Session 1",
        description: "",
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

  it("retains existing sessions when adding a new one", async () => {
    const now = new Date().toISOString();
    const createdSessionDto = buildSessionDto("session-2", "Session 2", now);
    let resolveCreate: ((value: typeof createdSessionDto) => void) | undefined;
    createSessionMock.mockImplementation(() =>
      new Promise<typeof createdSessionDto>((resolve) => {
        resolveCreate = resolve;
      }),
    );

    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("Session 2");

    try {
      const user = userEvent.setup();
      const { client } = renderChatPage();

      await waitFor(() => expect(listSessionsMock).toHaveBeenCalled());

      const addButton = await screen.findByRole("button", { name: "New session" });
      await user.click(addButton);

      await waitFor(() => expect(createSessionMock).toHaveBeenCalledTimes(1));

      sessionCreatedHandlers.forEach((handler) => handler(createdSessionDto));

      resolveCreate?.(createdSessionDto);

      const createdSession = await screen.findByRole("button", { name: "Session 2" });

      await waitFor(() => expect(createdSession).toBeInTheDocument());

      expect(screen.getByRole("button", { name: "Session 1" })).toBeInTheDocument();

      const sessions = client.getQueryData([
        "chat-sessions",
      ]) as Array<{ id: string; title: string }>;
      expect(sessions?.map((session) => session.id)).toEqual([
        "session-2",
        "session-1",
      ]);
    } finally {
      promptSpy.mockRestore();
    }
  });

  it("keeps prior sessions visible when create resolves without socket broadcast", async () => {
    const now = new Date().toISOString();
    const createdSessionDto = buildSessionDto("session-2", "Session 2", now);
    let resolveCreate: ((value: typeof createdSessionDto) => void) | undefined;
    createSessionMock.mockImplementation(() =>
      new Promise<typeof createdSessionDto>((resolve) => {
        resolveCreate = resolve;
      }),
    );

    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("Session 2");

    try {
      const user = userEvent.setup();
      const { client } = renderChatPage();

      await waitFor(() => expect(listSessionsMock).toHaveBeenCalled());

      const addButton = await screen.findByRole("button", { name: "New session" });
      await user.click(addButton);

      await waitFor(() => expect(createSessionMock).toHaveBeenCalledTimes(1));

      resolveCreate?.(createdSessionDto);

      const createdSession = await screen.findByRole("button", { name: "Session 2" });
      await waitFor(() => expect(createdSession).toBeInTheDocument());

      expect(screen.getByRole("button", { name: "Session 1" })).toBeInTheDocument();

      const sessions = client.getQueryData([
        "chat-sessions",
      ]) as Array<{ id: string; title: string }>;
      expect(sessions?.map((session) => session.id)).toEqual([
        "session-2",
        "session-1",
      ]);
    } finally {
      promptSpy.mockRestore();
    }
  });
});
