import { useCallback, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LayoutPreferencesDto } from "@eddie/api-client";
import { createChatPageRenderer } from "./test-utils";

const catalogMock = vi.fn();
const listSessionsMock = vi.fn();
const listMessagesMock = vi.fn();
const getMetadataMock = vi.fn();
const getExecutionStateMock = vi.fn();
const loadConfigMock = vi.fn();
const updatePreferencesMock = vi.fn<
  (updater: (previous: LayoutPreferencesDto) => LayoutPreferencesDto) => void
>();

class ResizeObserverMock {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

Object.defineProperty(globalThis, "ResizeObserver", {
  value: ResizeObserverMock,
});

vi.mock("@/hooks/useLayoutPreferences", () => ({
  useLayoutPreferences: () => {
    const [preferences, setPreferences] = useState<LayoutPreferencesDto>({
      chat: {
        selectedSessionId: "session-1",
        sessionSettings: {},
        collapsedPanels: {},
        templates: {},
      },
    });
    const updatePreferences = useCallback(
      (updater: (previous: LayoutPreferencesDto) => LayoutPreferencesDto) => {
        updatePreferencesMock(updater);
        setPreferences((previous) => updater(previous));
      },
      [],
    );
    return {
      preferences,
      updatePreferences,
      isSyncing: false,
      isRemoteAvailable: true,
    };
  },
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
    updatePreferencesMock.mockReset();
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

  it("keeps provider profiles with shared provider names distinct", async () => {
    const user = userEvent.setup();
    catalogMock.mockResolvedValue([]);
    loadConfigMock.mockResolvedValueOnce({
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
          "profile-openai-mini": {
            provider: { name: "openai" },
            model: "gpt-4.0-mini",
          },
        },
      },
      error: null,
    });

    renderChatPage();

    await waitFor(() => expect(loadConfigMock).toHaveBeenCalledTimes(1));

    await waitFor(() =>
      expect(document.querySelector('button[aria-label="Provider"]')).not.toBeNull()
    );
    const trigger = document.querySelector(
      'button[aria-label="Provider"]'
    ) as HTMLButtonElement;
    const baselineCallCount = updatePreferencesMock.mock.calls.length;
    await user.click(trigger);
    await user.click(
      await screen.findByRole("option", { name: "profile-openai-mini" })
    );

    const modelInput = await screen.findByLabelText(/model/i);

    await waitFor(() =>
      expect(updatePreferencesMock.mock.calls.length).toBe(baselineCallCount + 1)
    );
    await waitFor(() => expect(modelInput).toHaveValue("gpt-4.0-mini"));

    await user.click(trigger);
    await user.click(
      await screen.findByRole("option", { name: "profile-openai" })
    );

    await waitFor(() =>
      expect(updatePreferencesMock.mock.calls.length).toBe(baselineCallCount + 2)
    );
    await waitFor(() => expect(modelInput).toHaveValue("gpt-4.1"));
  });
});
