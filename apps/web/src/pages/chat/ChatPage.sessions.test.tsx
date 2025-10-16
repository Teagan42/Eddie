import userEvent from "@testing-library/user-event";
import { QueryClient } from "@tanstack/react-query";
import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createChatPageRenderer } from "./test-utils";

const sessionCreatedHandlers: Array<(session: unknown) => void> = [];
const sessionDeletedHandlers: Array<(sessionId: string) => void> = [];

const updatePreferencesMock = vi.fn();

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
    updatePreferences: updatePreferencesMock,
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
        onSessionDeleted: vi.fn((handler: (sessionId: string) => void) => {
          sessionDeletedHandlers.push(handler);
          return () => {
            const index = sessionDeletedHandlers.indexOf(handler);
            if (index >= 0) {
              sessionDeletedHandlers.splice(index, 1);
            }
          };
        }),
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
    sessionDeletedHandlers.length = 0;
    updatePreferencesMock.mockReset();

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

  it("clears selected session preference when the active session is deleted", async () => {
    renderChatPage();

    await waitFor(() => expect(listSessionsMock).toHaveBeenCalled());

    expect(sessionDeletedHandlers.length).toBeGreaterThan(0);

    expect(() => {
      sessionDeletedHandlers.forEach((handler) => handler("session-1"));
    }).not.toThrow();

    await waitFor(() => expect(updatePreferencesMock).toHaveBeenCalled());

    const updateFn = updatePreferencesMock.mock.calls.at(-1)?.[0] as
      | ((previous: unknown) => { chat?: { selectedSessionId: string | null } })
      | undefined;

    expect(typeof updateFn).toBe("function");

    const result = updateFn?.({
      chat: {
        selectedSessionId: "session-1",
        sessionSettings: {},
        collapsedPanels: {},
        templates: {},
      },
      updatedAt: new Date().toISOString(),
    });

    expect(result?.chat?.selectedSessionId ?? null).toBeNull();
  });
});
