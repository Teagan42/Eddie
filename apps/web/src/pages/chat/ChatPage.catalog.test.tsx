import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { screen, waitFor } from "@testing-library/react";
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

describe("ChatPage provider catalog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const timestamp = new Date().toISOString();
    getExecutionStateMock.mockResolvedValue(null);
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
          "profile-anthropic": {
            provider: { name: "anthropic" },
            model: "claude-3.5",
          },
        },
      },
      error: null,
    });
    catalogMock.mockResolvedValue([
      {
        name: "api-provider",
        label: "Provider From API",
        models: ["api-model-1", "api-model-2"],
      },
    ]);
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
  });

  it("displays provider profiles without exposing model selection", async () => {
    renderChatPage();

    await waitFor(() => expect(loadConfigMock).toHaveBeenCalledTimes(1));

    await waitFor(() =>
      expect(
        document.querySelector('button[aria-label="Provider"]')
      ).not.toBeNull()
    );
    const trigger = document.querySelector(
      'button[aria-label="Provider"]'
    ) as HTMLButtonElement;
    await userEvent.click(trigger);

    expect(
      await screen.findByRole("option", { name: "profile-openai" })
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByText("gpt-4.1")).not.toBeInTheDocument()
    );
  });

  it("populates provider options from configuration profiles", async () => {
    catalogMock.mockResolvedValue([]);
    renderChatPage();

    await waitFor(() => expect(loadConfigMock).toHaveBeenCalledTimes(1));

    await waitFor(() =>
      expect(
        document.querySelector('button[aria-label="Provider"]')
      ).not.toBeNull()
    );
    const trigger = document.querySelector(
      'button[aria-label="Provider"]'
    ) as HTMLButtonElement;
    await userEvent.click(trigger);

    expect(
      await screen.findByRole("option", { name: "profile-openai" })
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("option", { name: "profile-anthropic" })
    ).toBeInTheDocument();
  });

  it("hides provider controls when configuration profiles are unavailable", async () => {
    catalogMock.mockResolvedValue([]);
    loadConfigMock.mockResolvedValueOnce({
      path: null,
      format: "yaml" as const,
      content: "",
      input: {},
      config: { providers: {} },
      error: null,
    });

    renderChatPage();

    await waitFor(() => expect(loadConfigMock).toHaveBeenCalledTimes(1));

    expect(
      document.querySelector('button[aria-label="Provider"]')
    ).toBeNull();
  });
});
