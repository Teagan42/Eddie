import { waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { OrchestratorMetadataDto } from "@eddie/api-client";

import { createChatPageRenderer } from "./test-utils";

const listSessionsMock = vi.fn();
const listMessagesMock = vi.fn();
const getMetadataMock = vi.fn();
const catalogMock = vi.fn();

let latestToolNodes: OrchestratorMetadataDto["toolInvocations"] = [];

vi.mock("./components", async () => {
  const actual = await vi.importActual<typeof import("./components")>("./components");
  return {
    ...actual,
    ToolTree: vi.fn((props: Parameters<typeof actual.ToolTree>[0]) => {
      latestToolNodes = props.nodes;
      return null;
    }),
  };
});

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
      tools: {
        onToolCall: vi.fn().mockReturnValue(() => {}),
        onToolResult: vi.fn().mockReturnValue(() => {}),
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

describe("ChatPage tool tree agent filtering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    latestToolNodes = [];

    const timestamp = new Date().toISOString();
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
    catalogMock.mockResolvedValue([]);

    getMetadataMock.mockResolvedValue({
      sessionId: "session-1",
      contextBundles: [],
      agentHierarchy: [
        {
          id: "root-agent",
          name: "orchestrator",
          provider: "openai",
          model: "gpt-4o",
          depth: 0,
          metadata: {},
          children: [
            {
              id: "child-agent",
              name: "scout",
              provider: "anthropic",
              model: "claude-3.5",
              depth: 1,
              metadata: {},
              children: [],
            },
          ],
        },
      ],
      toolInvocations: [
        {
          id: "root-call",
          name: "plan",
          status: "running",
          metadata: {
            agentId: "root-agent",
            createdAt: timestamp,
          },
          children: [
            {
              id: "untagged-leaf",
              name: "live-update",
              status: "running",
              metadata: {
                createdAt: timestamp,
              },
              children: [],
            },
          ],
        },
      ],
    } satisfies OrchestratorMetadataDto);
  });

  it("keeps untagged tool leaves when focusing on a child agent", async () => {
    const user = userEvent.setup();

    renderChatPage();

    await waitFor(() => expect(getMetadataMock).toHaveBeenCalledTimes(1));

    await waitFor(() => expect(latestToolNodes).not.toHaveLength(0));

    const agentPanelHeading = await within(document.body).findByRole("heading", {
      name: /agent hierarchy/i,
    });
    const agentPanel = agentPanelHeading.closest("section");
    expect(agentPanel).toBeInstanceOf(HTMLElement);
    const scoutButton = within(agentPanel as HTMLElement).getByRole("button", {
      name: /select scout agent/i,
    });

    await user.click(scoutButton);

    await waitFor(() => {
      const rootCall = latestToolNodes.find((node) => node.id === "root-call");
      expect(rootCall).toBeDefined();
      expect(rootCall?.children.find((child) => child.id === "untagged-leaf")).toBeDefined();
    });
  });
});
