import userEvent from "@testing-library/user-event";
import { QueryClient } from "@tanstack/react-query";
import { act, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatSessionDto, LayoutPreferencesDto } from "@eddie/api-client";
import { createChatPageRenderer } from "./test-utils";
import { getSessionTablistAriaLabel } from "@eddie/ui";

const sessionCreatedHandlers: Array<(session: unknown) => void> = [];
const sessionDeletedHandlers: Array<(sessionId: string) => void> = [];
const messageCreatedHandlers: Array<(message: any) => void> = [];
const messageUpdatedHandlers: Array<(message: any) => void> = [];

const updatePreferencesMock = vi.fn();

let preferencesState: LayoutPreferencesDto = {
  chat: {
    selectedSessionId: "session-1",
    sessionSettings: {},
    collapsedPanels: {},
    templates: {},
  },
};

const catalogMock = vi.fn();
const listSessionsMock = vi.fn();
const listMessagesMock = vi.fn();
const createSessionMock = vi.fn();
const renameSessionMock = vi.fn();
const deleteSessionMock = vi.fn();
const getMetadataMock = vi.fn();
const getExecutionStateMock = vi.fn();
const loadConfigMock = vi.fn();
const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));

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
    preferences: preferencesState,
    updatePreferences: (
      updater: (previous: LayoutPreferencesDto) => LayoutPreferencesDto,
    ) => {
      updatePreferencesMock(updater);
      const next = updater(preferencesState);
      preferencesState = next ?? preferencesState;
      return preferencesState;
    },
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
        rename: renameSessionMock,
        delete: deleteSessionMock,
        get: vi.fn(),
        archive: vi.fn(),
        createMessage: vi.fn(),
      },
      orchestrator: {
        getMetadata: getMetadataMock,
        getExecutionState: getExecutionStateMock,
      },
      config: {
        loadEddieConfig: loadConfigMock,
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
        onMessageCreated: vi.fn((handler: (message: unknown) => void) => {
          messageCreatedHandlers.push(handler);
          return () => {
            const index = messageCreatedHandlers.indexOf(handler);
            if (index >= 0) {
              messageCreatedHandlers.splice(index, 1);
            }
          };
        }),
        onMessageUpdated: vi.fn((handler: (message: unknown) => void) => {
          messageUpdatedHandlers.push(handler);
          return () => {
            const index = messageUpdatedHandlers.indexOf(handler);
            if (index >= 0) {
              messageUpdatedHandlers.splice(index, 1);
            }
          };
        }),
        onAgentActivity: vi.fn().mockReturnValue(() => {}),
      },
    },
  }),
}));

vi.mock("@/vendor/hooks/use-toast", () => ({
  toast: toastMock,
  useToast: () => ({
    toast: toastMock,
    dismiss: vi.fn(),
    toasts: [],
  }),
}));

const renderChatPage = createChatPageRenderer(
  () =>
    new QueryClient({
      defaultOptions: { queries: { retry: false } },
    }),
);

function getSessionMetricsDescription(tab: HTMLElement): HTMLElement | null {
  const descriptionId = tab.getAttribute("aria-describedby");
  return descriptionId ? document.getElementById(descriptionId) : null;
}

async function expectToastWith(match: { title: string; variant: string }) {
  await waitFor(() =>
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining(match)),
  );
}

describe("ChatPage session creation", () => {
  const buildSessionDto = (id: string, title: string, timestamp: string) => ({
    id,
    title,
    description: "",
    status: "active" as const,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  async function chooseSessionMenuAction(
    user: ReturnType<typeof userEvent.setup>,
    sessionTitle: string,
    actionLabel: string,
  ): Promise<void> {
    const menuTrigger = await screen.findByRole("button", {
      name: `Session options for ${sessionTitle}`,
    });
    await user.click(menuTrigger);

    const action = await screen.findByRole("menuitem", { name: actionLabel });
    await user.click(action);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    sessionCreatedHandlers.length = 0;
    sessionDeletedHandlers.length = 0;
    messageCreatedHandlers.length = 0;
    messageUpdatedHandlers.length = 0;
    updatePreferencesMock.mockReset();
    preferencesState = {
      chat: {
        selectedSessionId: "session-1",
        sessionSettings: {},
        collapsedPanels: {},
        templates: {},
      },
    };
    toastMock.mockReset();
    renameSessionMock.mockReset();
    deleteSessionMock.mockReset();

    getExecutionStateMock.mockResolvedValue(null);
    const now = new Date().toISOString();

    catalogMock.mockResolvedValue([]);
    loadConfigMock.mockResolvedValue({
      path: null,
      format: "yaml" as const,
      content: "",
      input: {},
      config: {
        providers: {
          "profile-openai": {
            provider: { name: "openai" },
            model: "gpt-4.1",
          },
        },
      },
      error: null,
    });
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

      const createdSession = await screen.findByRole("tab", { name: "Session 2" });

      await waitFor(() => expect(createdSession).toBeInTheDocument());

      expect(screen.getByRole("tab", { name: "Session 1" })).toBeInTheDocument();

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

  it("displays cached aggregate metrics for each session", async () => {
    const now = new Date().toISOString();
    listMessagesMock.mockResolvedValueOnce([
      {
        id: "message-1",
        sessionId: "session-1",
        role: "user",
        content: "Hello",
        createdAt: now,
        updatedAt: now,
        annotations: [],
        status: "completed",
      },
      {
        id: "message-2",
        sessionId: "session-1",
        role: "assistant",
        content: "World",
        createdAt: now,
        updatedAt: now,
        annotations: [],
        status: "completed",
      },
    ]);
    getMetadataMock.mockResolvedValueOnce({
      contextBundles: [
        { id: "bundle-1", title: "Bundle 1", tokens: 256, createdAt: now, type: "memory" },
        { id: "bundle-2", title: "Bundle 2", tokens: 128, createdAt: now, type: "memory" },
      ],
      toolInvocations: [],
      agentHierarchy: [
        {
          id: "agent-1",
          name: "Agent One",
          type: "workflow",
          metadata: {},
          children: [
            { id: "agent-2", name: "Agent Two", type: "workflow", metadata: {}, children: [] },
          ],
        },
      ],
    });

    renderChatPage();

    const tabList = await screen.findByRole("tablist", {
      name: getSessionTablistAriaLabel("Active"),
    });
    expect(tabList).toBeInTheDocument();

    const sessionTab = within(tabList).getByRole("tab", { name: "Session 1" });
    expect(sessionTab).toHaveAttribute("aria-selected", "true");

    const description = getSessionMetricsDescription(sessionTab);
    expect(description).not.toBeNull();
    expect(description).toHaveTextContent("2 messages");
    expect(description).toHaveTextContent("2 bundles");
  });

  it("shows the active session count badge in the sessions panel header", async () => {
    renderChatPage();

    await screen.findByRole("tab", { name: "Session 1" });

    const heading = await screen.findByRole("heading", { level: 2, name: "Sessions" });
    const header = heading.closest("header");

    expect(header).not.toBeNull();

    const badge = within(header as HTMLElement).getByTestId("active-sessions-badge");
    expect(badge).toHaveTextContent(/Active Sessions/i);
    expect(badge).toHaveTextContent("1");
    expect(badge).toHaveClass("bg-[color:var(--hero-badge-bg)]");
  });

  it("updates message metrics when new messages stream in", async () => {
    const now = new Date().toISOString();
    listMessagesMock.mockResolvedValueOnce([]);
    getMetadataMock.mockResolvedValueOnce({
      contextBundles: [],
      toolInvocations: [],
      agentHierarchy: [],
    });

    renderChatPage();

    const sessionTab = await screen.findByRole("tab", { name: "Session 1" });
    const initialDescription = getSessionMetricsDescription(sessionTab);
    expect(initialDescription).not.toBeNull();
    expect(initialDescription).toHaveTextContent("0 messages");
    const initialBadge = within(sessionTab).getByLabelText("0 messages");
    expect(initialBadge).toHaveTextContent("0");
    expect(initialBadge.closest('[data-highlighted="true"]')).toBeNull();

    const newMessage = {
      id: "message-3",
      sessionId: "session-1",
      role: "assistant",
      content: "Hello",
      createdAt: now,
      updatedAt: now,
      annotations: [],
      status: "completed",
    };

    await act(async () => {
      messageCreatedHandlers.forEach((handler) => handler(newMessage));
    });

    await waitFor(() => {
      const updatedDescription = getSessionMetricsDescription(sessionTab);
      expect(updatedDescription).not.toBeNull();
      expect(updatedDescription).toHaveTextContent("1 message");
      const updatedBadge = within(sessionTab).getByLabelText("1 message");
      expect(updatedBadge).toHaveTextContent("1");
      expect(updatedBadge.closest('[data-highlighted="true"]')).not.toBeNull();
    });
  });

  it("notifies and clears the selected session when fetching messages returns 404", async () => {
    listMessagesMock.mockRejectedValueOnce({ status: 404, message: "missing" });

    const { client } = renderChatPage();

    await expectToastWith({
      title: "Session no longer available",
      variant: "warning",
    });

    await waitFor(() => expect(updatePreferencesMock).toHaveBeenCalled());

    await waitFor(() =>
      expect(preferencesState.chat?.selectedSessionId ?? null).toBeNull(),
    );
    expect(preferencesState.chat?.sessionSettings ?? {}).not.toHaveProperty("session-1");
    expect(preferencesState.chat?.templates ?? {}).not.toHaveProperty("session-1");

    expect(
      client.getQueryData(["chat-session", "session-1", "messages"]),
    ).toBeUndefined();
  });

  it("notifies and prunes sessions missing from the server response", async () => {
    const now = new Date().toISOString();
    const sessionOne = buildSessionDto("session-1", "Session 1", now);
    const sessionTwo = buildSessionDto("session-2", "Session 2", now);

    listSessionsMock.mockResolvedValueOnce([sessionOne, sessionTwo]);
    listSessionsMock.mockResolvedValueOnce([sessionOne]);

    preferencesState = {
      chat: {
        selectedSessionId: "session-1",
        sessionSettings: {
          "session-1": { provider: "openai" },
          "session-2": { provider: "openai" },
        },
        collapsedPanels: {},
        templates: {
          "session-2": { name: "Template 2" },
        },
      },
    };

    const { client } = renderChatPage();

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Session 2" })).toBeInTheDocument(),
    );

    await act(async () => {
      await client.invalidateQueries({ queryKey: ["chat-sessions"] });
    });

    await waitFor(() => expect(listSessionsMock).toHaveBeenCalledTimes(2));

    await expectToastWith({
      title: "Sessions no longer available",
      variant: "warning",
    });

    await waitFor(() =>
      expect(screen.queryByRole("tab", { name: "Session 2" })).not.toBeInTheDocument(),
    );

    expect(preferencesState.chat?.sessionSettings ?? {}).not.toHaveProperty("session-2");
    expect(preferencesState.chat?.templates ?? {}).not.toHaveProperty("session-2");

    const sessions = client.getQueryData<ChatSessionDto[]>(["chat-sessions"]) ?? [];
    expect(sessions.some((session) => session.id === "session-2")).toBe(false);
  });

  it("highlights metrics when orchestrator metadata updates", async () => {
    const now = new Date().toISOString();
    listMessagesMock.mockResolvedValueOnce([]);
    getMetadataMock.mockResolvedValueOnce({
      contextBundles: [],
      toolInvocations: [],
      agentHierarchy: [],
    });

    const { client, rerender } = renderChatPage();

    const sessionTab = await screen.findByRole("tab", { name: "Session 1" });
    await waitFor(() => {
      const description = getSessionMetricsDescription(sessionTab);
      expect(description).not.toBeNull();
      expect(description).not.toHaveTextContent("0 bundles");
    });

    const initialDescription = getSessionMetricsDescription(sessionTab);
    expect(initialDescription).not.toBeNull();
    expect(initialDescription).toHaveAttribute("aria-live", "polite");

    await act(async () => {
      client.setQueryData(
        ["orchestrator-metadata", "session-1"],
        {
          sessionId: "session-1",
          contextBundles: [
            { id: "bundle-1", title: "Bundle 1", tokens: 64, createdAt: now, type: "memory" },
          ],
          toolInvocations: [],
          agentHierarchy: [],
        },
      );
      rerender();
    });

    await waitFor(() => {
      const updatedDescription = getSessionMetricsDescription(sessionTab);
      expect(updatedDescription).not.toBeNull();
      expect(updatedDescription).toHaveTextContent("1 bundle");
      expect(updatedDescription).toHaveAttribute("aria-live", "polite");
      const bundleBadge = within(sessionTab).getByLabelText("1 bundle");
      expect(bundleBadge).toHaveTextContent("1");
      expect(bundleBadge.closest('[data-highlighted="true"]')).not.toBeNull();
    });
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

      const createdSession = await screen.findByRole("tab", { name: "Session 2" });
      await waitFor(() => expect(createdSession).toBeInTheDocument());

      expect(screen.getByRole("tab", { name: "Session 1" })).toBeInTheDocument();

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

  it("renames a session via the selector and merges cache updates", async () => {
    const now = new Date().toISOString();
    const renamedSession = {
      id: "session-1",
      title: "Session Prime",
      description: "",
      status: "active" as const,
      createdAt: now,
      updatedAt: now,
    };
    renameSessionMock.mockResolvedValue(renamedSession);

    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("Session Prime");

    try {
      const user = userEvent.setup();
      const { client } = renderChatPage();

      await waitFor(() => expect(listSessionsMock).toHaveBeenCalled());

      await chooseSessionMenuAction(user, "Session 1", "Rename session");

      await waitFor(() =>
        expect(renameSessionMock).toHaveBeenCalledWith("session-1", {
          title: "Session Prime",
        }),
      );

      const sessions = (client.getQueryData([
        "chat-sessions",
      ]) as ChatSessionDto[]) ?? [];
      expect(sessions.find((session) => session.id === "session-1")?.title).toBe(
        "Session Prime",
      );
    } finally {
      promptSpy.mockRestore();
    }
  });

  it("shows a success toast when a rename mutation resolves", async () => {
    const now = new Date().toISOString();
    const renamedSession = {
      id: "session-1",
      title: "Session Prime",
      description: "",
      status: "active" as const,
      createdAt: now,
      updatedAt: now,
    } satisfies ChatSessionDto;
    renameSessionMock.mockResolvedValue(renamedSession);

    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("Session Prime");

    try {
      const user = userEvent.setup();
      renderChatPage();

      await waitFor(() => expect(listSessionsMock).toHaveBeenCalled());

      await chooseSessionMenuAction(user, "Session 1", "Rename session");

      await waitFor(() => expect(renameSessionMock).toHaveBeenCalled());

      await expectToastWith({
        title: "Session renamed",
        variant: "success",
      });
    } finally {
      promptSpy.mockRestore();
    }
  });

  it("restores prior title and shows an error toast when rename fails", async () => {
    renameSessionMock.mockRejectedValue(new Error("nope"));

    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("Session Prime");

    try {
      const user = userEvent.setup();
      const { client } = renderChatPage();

      await waitFor(() => expect(listSessionsMock).toHaveBeenCalled());

      await chooseSessionMenuAction(user, "Session 1", "Rename session");

      await waitFor(() => expect(renameSessionMock).toHaveBeenCalled());

      await waitFor(() => {
        const sessions = (client.getQueryData([
          "chat-sessions",
        ]) as ChatSessionDto[]) ?? [];
        expect(sessions.find((session) => session.id === "session-1")?.title).toBe(
          "Session 1",
        );
      });

      await expectToastWith({
        title: "Failed to rename session",
        variant: "error",
      });
    } finally {
      promptSpy.mockRestore();
    }
  });

  it("deletes a session, updates caches, and clears session state", async () => {
    deleteSessionMock.mockResolvedValue(undefined);

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    try {
      const user = userEvent.setup();
      const { client } = renderChatPage();

      client.setQueryData(["chat-session", "session-1", "messages"], [{ id: "msg-1" }]);
      client.setQueryData(["orchestrator-metadata", "session-1"], {
        sessionId: "session-1",
        contextBundles: [],
        toolInvocations: [],
        agentHierarchy: [],
        capturedAt: new Date().toISOString(),
      });

      await waitFor(() => expect(listSessionsMock).toHaveBeenCalled());

      await chooseSessionMenuAction(user, "Session 1", "Archive session");

      await waitFor(() => expect(deleteSessionMock).toHaveBeenCalledWith("session-1"));

      await waitFor(() => {
        const sessions = (client.getQueryData([
          "chat-sessions",
        ]) as ChatSessionDto[]) ?? [];
        expect(sessions.some((session) => session.id === "session-1")).toBe(false);
      });

      expect(client.getQueryData(["chat-session", "session-1", "messages"])).toEqual([]);
      const metadata = client.getQueryData([
        "orchestrator-metadata",
        "session-1",
      ]);
      expect(metadata).toBeNull();
      await expectToastWith({
        title: "Session deleted",
        variant: "success",
      });
    } finally {
      confirmSpy.mockRestore();
    }
  });

  it("restores session caches and shows an error toast when delete fails", async () => {
    deleteSessionMock.mockRejectedValue(new Error("nope"));

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    try {
      const user = userEvent.setup();
      const { client } = renderChatPage();

      await waitFor(() => expect(listSessionsMock).toHaveBeenCalled());

      await chooseSessionMenuAction(user, "Session 1", "Archive session");

      await waitFor(() => expect(deleteSessionMock).toHaveBeenCalled());

      const sessions = (client.getQueryData([
        "chat-sessions",
      ]) as ChatSessionDto[]) ?? [];
      expect(sessions.some((session) => session.id === "session-1")).toBe(true);

      await expectToastWith({
        title: "Failed to delete session",
        variant: "error",
      });
    } finally {
      confirmSpy.mockRestore();
    }
  });
});
