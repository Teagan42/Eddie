import { QueryClient } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createChatPageRenderer } from "./test-utils";
import { CollapsiblePanel } from "@eddie/ui";
import { TooltipProvider } from "@radix-ui/react-tooltip";

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
const getExecutionStateMock = vi.fn();
const catalogMock = vi.fn();
const loadConfigMock = vi.fn();

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

vi.mock("./useChatMessagesRealtime", () => ({
  useChatMessagesRealtime: vi.fn(() => ({
    messages: [],
    appendMessage: vi.fn(),
    updateMessage: vi.fn(),
  })),
}));

const renderChatPage = createChatPageRenderer(
  () =>
    new QueryClient({
      defaultOptions: { queries: { retry: false } },
    }),
);

describe("ChatPage message surfaces", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    getExecutionStateMock.mockResolvedValue(null);
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
  });

  it("renders darker, low-gradient surfaces for chat messages", async () => {
    renderChatPage();

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

    expect(userCard).toHaveClass("from-emerald-500/25");
    expect(userCard).toHaveClass("via-emerald-500/5");
    expect(userCard).toHaveClass("to-slate-950/70");

    expect(assistantCard).toHaveClass("from-sky-500/25");
    expect(assistantCard).toHaveClass("via-sky-500/5");
    expect(assistantCard).toHaveClass("to-slate-950/70");
  });

  it("styles the re-issue command button like the collapsible panel toggle", async () => {
    renderChatPage();

    await waitFor(() => expect(listMessagesMock).toHaveBeenCalledTimes(1));

    const reissueButton = await screen.findByRole("button", { name: "Re-issue command" });

    const { container } = render(
      <TooltipProvider>
        <CollapsiblePanel
          id="panel"
          title="Panel"
          description=""
          collapsed={false}
          onToggle={vi.fn()}
        >
          Content
        </CollapsiblePanel>
      </TooltipProvider>,
    );

    const collapsibleToggle = within(container).getAllByRole("button", {
      name: "Collapse panel",
    })[0];

    expect(reissueButton.getAttribute("data-accent-color")).toBe(
      collapsibleToggle.getAttribute("data-accent-color"),
    );
    expect(reissueButton.getAttribute("data-variant")).toBe(
      collapsibleToggle.getAttribute("data-variant"),
    );
    expect(reissueButton).toHaveClass("rt-r-size-1");
    expect(reissueButton).not.toHaveClass("rt-r-size-2");
    expect(collapsibleToggle).toHaveClass("rt-r-size-2");
  });
});
