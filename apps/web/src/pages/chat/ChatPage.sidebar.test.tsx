import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createChatPageRenderer } from "./test-utils";

const catalogMock = vi.fn();
const listSessionsMock = vi.fn();
const listMessagesMock = vi.fn();
const getMetadataMock = vi.fn();
const getExecutionStateMock = vi.fn();
const loadConfigMock = vi.fn();

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

const renderChatPage = createChatPageRenderer(
  () =>
    new QueryClient({
      defaultOptions: { queries: { retry: false } },
    }),
);

describe("ChatPage sidebar accessibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const now = new Date().toISOString();

    getExecutionStateMock.mockResolvedValue(null);
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

  it("exposes agent tools via a slide-out drawer", async () => {
    const user = userEvent.setup();
    renderChatPage();

    await waitFor(() => expect(listSessionsMock).toHaveBeenCalled());

    expect(
      screen.queryByRole("dialog", { name: /agent tools/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Agent execution" }),
    ).not.toBeInTheDocument();

    const openDrawerButton = await screen.findByRole("button", {
      name: /open agent tools/i,
    });

    await user.click(openDrawerButton);

    const drawer = await screen.findByRole("dialog", { name: /agent tools/i });

    expect(
      within(drawer).getByRole("heading", { name: "Agent execution" }),
    ).toBeInTheDocument();
    expect(
      within(drawer).getByRole("heading", { name: "Context bundles" }),
    ).toBeInTheDocument();
  });

  it("uses solid variant collapse toggles for higher contrast", async () => {
    const user = userEvent.setup();
    renderChatPage();

    await waitFor(() => expect(listSessionsMock).toHaveBeenCalled());

    const openDrawerButton = await screen.findByRole("button", {
      name: /open agent tools/i,
    });
    await user.click(openDrawerButton);

    const drawer = await screen.findByRole("dialog", { name: /agent tools/i });

    const collapseButtons = within(drawer).getAllByRole("button", {
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

  it("focuses the main chat layout until the tools drawer is opened", async () => {
    renderChatPage();

    await waitFor(() => expect(listSessionsMock).toHaveBeenCalled());

    const chatPanels = screen.getAllByRole("heading", { level: 2 });

    for (const heading of chatPanels) {
      expect(heading).not.toHaveTextContent("Agent execution");
      expect(heading).not.toHaveTextContent("Context bundles");
    }
  });
});
