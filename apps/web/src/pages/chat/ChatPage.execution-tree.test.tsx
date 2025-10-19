import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createExecutionTreeStateFromMetadata, type ExecutionTreeState } from './execution-tree-state';
import { createChatPageRenderer } from './test-utils';

const listSessionsMock = vi.fn();
const listMessagesMock = vi.fn();
const getMetadataMock = vi.fn();
const getExecutionStateMock = vi.fn();
const catalogMock = vi.fn();

const toolCallHandlers: Array<(payload: unknown) => void> = [];
const toolResultHandlers: Array<(payload: unknown) => void> = [];
const executionTreeHandlers: Array<(payload: unknown) => void> = [];
const executionTreeUnsubscribes: Array<ReturnType<typeof vi.fn>> = [];

const onExecutionTreeUpdatedMock = vi.fn(
  (handler: (payload: unknown) => void) => {
    executionTreeHandlers.push(handler);
    const unsubscribe = vi.fn();
    executionTreeUnsubscribes.push(unsubscribe);
    return unsubscribe;
  },
);

class ResizeObserverMock {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

Object.defineProperty(globalThis, 'ResizeObserver', {
  value: ResizeObserverMock,
});

Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
  value: vi.fn(),
  configurable: true,
});

vi.mock('@/hooks/useLayoutPreferences', () => ({
  useLayoutPreferences: () => ({
    preferences: {
      chat: {
        selectedSessionId: 'session-1',
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

vi.mock('@/api/api-provider', () => ({
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
        onExecutionTreeUpdated: onExecutionTreeUpdatedMock,
      },
      tools: {
        onToolCall: vi.fn((handler: (payload: unknown) => void) => {
          toolCallHandlers.push(handler);
          return () => {
            const index = toolCallHandlers.indexOf(handler);
            if (index >= 0) {
              toolCallHandlers.splice(index, 1);
            }
          };
        }),
        onToolResult: vi.fn((handler: (payload: unknown) => void) => {
          toolResultHandlers.push(handler);
          return () => {
            const index = toolResultHandlers.indexOf(handler);
            if (index >= 0) {
              toolResultHandlers.splice(index, 1);
            }
          };
        }),
      },
    },
  }),
}));

vi.mock('./useChatMessagesRealtime', () => ({
  useChatMessagesRealtime: vi.fn(),
}));

const renderChatPage = createChatPageRenderer(
  () =>
    new QueryClient({
      defaultOptions: { queries: { retry: false } },
    }),
);

describe('ChatPage execution tree realtime updates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toolCallHandlers.length = 0;
    toolResultHandlers.length = 0;
    executionTreeHandlers.length = 0;
    executionTreeUnsubscribes.length = 0;
    onExecutionTreeUpdatedMock.mockClear();

    const now = new Date().toISOString();

    catalogMock.mockResolvedValue([]);
    listSessionsMock.mockResolvedValue([
      {
        id: 'session-1',
        title: 'Session 1',
        description: null,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
    ]);
    listMessagesMock.mockResolvedValue([]);
    getMetadataMock.mockResolvedValue({
      sessionId: 'session-1',
      contextBundles: [],
      toolInvocations: [],
      agentHierarchy: [
        {
          id: 'session-1',
          name: 'Session 1',
          provider: 'orchestrator',
          model: 'delegator',
          depth: 0,
          metadata: { messageCount: 0 },
          children: [
            {
              id: 'agent-primary',
              name: 'Primary agent',
              provider: 'openai',
              model: 'gpt-4o',
              depth: 1,
              metadata: { messageCount: 0 },
              children: [],
            },
          ],
        },
      ],
    });
    getExecutionStateMock.mockResolvedValue(null);
  });

  it('syncs execution tree snapshots from websocket events for the selected session', async () => {
    const { client, unmount } = renderChatPage();

    await waitFor(() => {
      expect(onExecutionTreeUpdatedMock).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(getMetadataMock).toHaveBeenCalled();
    });

    await act(async () => {
      executionTreeHandlers.forEach((handler) =>
        handler({
          sessionId: 'session-2',
          state: createExecutionTreeStateFromMetadata({
            sessionId: 'session-2',
            capturedAt: '2024-05-01T12:00:00.000Z',
            contextBundles: [],
            toolInvocations: [],
            agentHierarchy: [],
          }),
        }),
      );
    });

    expect(
      client.getQueryData([
        'orchestrator-metadata',
        'session-2',
      ]),
    ).toBeUndefined();

    const updatedTree = createExecutionTreeStateFromMetadata({
      sessionId: 'session-1',
      capturedAt: '2024-05-01T12:30:00.000Z',
      contextBundles: [],
      toolInvocations: [],
      agentHierarchy: [],
    });

    await act(async () => {
      executionTreeHandlers.forEach((handler) =>
        handler({
          sessionId: 'session-1',
          state: updatedTree,
        }),
      );
    });

    await waitFor(() => {
      const snapshot = client.getQueryData([
        'orchestrator-metadata',
        'session-1',
      ]) as { executionTree: unknown; capturedAt?: string } | undefined;
      expect(snapshot).toMatchObject({
        capturedAt: updatedTree.updatedAt,
      });
      expect(snapshot?.executionTree).toEqual(updatedTree);
      expect(snapshot?.executionTree).not.toBe(updatedTree);
    });

    unmount();

    executionTreeUnsubscribes.forEach((unsubscribe) => {
      expect(unsubscribe).toHaveBeenCalled();
    });
  });

  it('requests execution state when connecting to realtime updates', async () => {
    const timestamp = '2024-07-15T09:00:00.000Z';
    const executionState: ExecutionTreeState = {
      agentHierarchy: [
        {
          id: 'agent-unique',
          name: 'Unique agent',
          provider: 'orchestrator',
          model: 'delegate',
          depth: 0,
          lineage: [],
          children: [],
        },
      ],
      toolInvocations: [],
      contextBundles: [],
      agentLineageById: { 'agent-unique': [] },
      toolGroupsByAgentId: {
        'agent-unique': {
          pending: [],
          running: [],
          completed: [],
          failed: [],
        },
      },
      contextBundlesByAgentId: {},
      contextBundlesByToolCallId: {},
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    getExecutionStateMock.mockResolvedValue(executionState);
    getMetadataMock.mockResolvedValueOnce({
      sessionId: 'session-1',
      contextBundles: [],
      toolInvocations: [],
      agentHierarchy: [],
    });

    const { client } = renderChatPage();

    await waitFor(() => {
      expect(getExecutionStateMock).toHaveBeenCalledWith('session-1');
    });

    await waitFor(() => {
      const snapshot = client.getQueryData([
        'orchestrator-metadata',
        'session-1',
      ]) as { executionTree?: ExecutionTreeState } | undefined;
      expect(snapshot?.executionTree).toMatchObject({
        agentHierarchy: executionState.agentHierarchy,
        updatedAt: executionState.updatedAt,
      });
      expect(
        snapshot?.executionTree?.toolGroupsByAgentId?.['agent-unique'],
      ).toBeDefined();
    });
  });

  it('coerces execution tree updates that omit context bundle arrays', async () => {
    const { client } = renderChatPage();

    await waitFor(() => {
      expect(onExecutionTreeUpdatedMock).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(getMetadataMock).toHaveBeenCalled();
    });

    const baseTree = createExecutionTreeStateFromMetadata({
      sessionId: 'session-1',
      capturedAt: '2024-05-01T12:45:00.000Z',
      agentHierarchy: [
        {
          id: 'session-1',
          name: 'Session 1',
          provider: 'orchestrator',
          model: 'delegator',
          depth: 0,
          metadata: { messageCount: 1 },
          children: [
            {
              id: 'agent-primary',
              name: 'Primary agent',
              provider: 'openai',
              model: 'gpt-4o',
              depth: 1,
              metadata: { messageCount: 1 },
              children: [],
            },
          ],
        },
      ],
      toolInvocations: [
        {
          id: 'call-1',
          name: 'web_search',
          status: 'running',
          metadata: {
            args: { query: 'latest docs' },
          },
          createdAt: '2024-05-01T12:40:00.000Z',
          updatedAt: '2024-05-01T12:41:00.000Z',
          agentId: 'agent-primary',
          agentModel: 'gpt-4o',
          provider: 'openai',
          children: [],
        },
      ],
      contextBundles: [],
    });

    const eventState = { ...baseTree, contextBundles: undefined } as unknown as typeof baseTree;

    await act(async () => {
      executionTreeHandlers.forEach((handler) =>
        handler({
          sessionId: 'session-1',
          state: eventState,
        }),
      );
    });

    await waitFor(() => {
      const snapshot = client.getQueryData<any>([
        'orchestrator-metadata',
        'session-1',
      ]);
      expect(
        snapshot?.executionTree?.toolInvocations?.some(
          (invocation: { id?: string }) => invocation?.id === 'call-1',
        ),
      ).toBe(true);
    });
  });

  it('preserves existing context bundles when realtime updates omit them', async () => {
    const now = '2024-05-01T12:55:00.000Z';
    const baseMetadata = {
      sessionId: 'session-1',
      capturedAt: now,
      agentHierarchy: [
        {
          id: 'session-1',
          name: 'Session 1',
          provider: 'orchestrator',
          model: 'delegator',
          depth: 0,
          metadata: { messageCount: 1 },
          children: [
            {
              id: 'agent-primary',
              name: 'Primary agent',
              provider: 'openai',
              model: 'gpt-4o',
              depth: 1,
              metadata: { messageCount: 1 },
              children: [],
            },
          ],
        },
      ],
      toolInvocations: [
        {
          id: 'call-1',
          name: 'web_search',
          status: 'running',
          metadata: {
            args: { query: 'latest docs' },
          },
          createdAt: '2024-05-01T12:50:00.000Z',
          updatedAt: '2024-05-01T12:51:00.000Z',
          agentId: 'agent-primary',
          agentModel: 'gpt-4o',
          provider: 'openai',
          children: [],
        },
      ],
      contextBundles: [
        {
          id: 'bundle-1',
          label: 'Search results',
          summary: 'Top web results',
          sizeBytes: 2048,
          fileCount: 2,
          files: [
            { path: 'result-1.txt', sizeBytes: 1024 },
            { path: 'result-2.txt', sizeBytes: 1024 },
          ],
        },
      ],
    } as const;

    getMetadataMock.mockResolvedValueOnce(baseMetadata);

    const { client } = renderChatPage();

    await waitFor(() => {
      expect(onExecutionTreeUpdatedMock).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(getMetadataMock).toHaveBeenCalled();
    });

    await waitFor(() => {
      const snapshot = client.getQueryData<any>([
        'orchestrator-metadata',
        'session-1',
      ]);
      expect(
        snapshot?.executionTree?.contextBundles?.some(
          (bundle: { id?: string }) => bundle?.id === 'bundle-1',
        ),
      ).toBe(true);
    });

    const updateState = createExecutionTreeStateFromMetadata({
      ...baseMetadata,
      capturedAt: '2024-05-01T13:05:00.000Z',
      contextBundles: [],
    });

    const realtimeState = {
      ...updateState,
      contextBundles: undefined,
    } as unknown as typeof updateState;

    await act(async () => {
      executionTreeHandlers.forEach((handler) =>
        handler({
          sessionId: 'session-1',
          state: realtimeState,
        }),
      );
    });

    await waitFor(() => {
      const snapshot = client.getQueryData<any>([
        'orchestrator-metadata',
        'session-1',
      ]);
      const bundleIds =
        snapshot?.executionTree?.contextBundles?.map(
          (bundle: { id?: string }) => bundle?.id,
        ) ?? [];
      expect(bundleIds).toContain('bundle-1');
      expect(snapshot?.capturedAt).toBe(updateState.updatedAt);
    });
  });

  it('updates tool status groups when tool call lifecycle events stream in', async () => {
    const user = userEvent.setup();
    const { client } = renderChatPage();

    await waitFor(() => {
      expect(toolCallHandlers.length).toBeGreaterThan(0);
    });

    await waitFor(() => {
      expect(getMetadataMock).toHaveBeenCalled();
    });

    await act(async () => {
      toolCallHandlers.forEach((handler) =>
        handler({
          sessionId: 'session-1',
          id: 'call-1',
          name: 'web_search',
          arguments: JSON.stringify({ query: 'latest docs' }),
          timestamp: '2024-05-01T12:00:00.000Z',
          agentId: 'agent-primary',
        }),
      );
    });

    await waitFor(() => {
      const snapshot = client.getQueryData<any>([
        'orchestrator-metadata',
        'session-1',
      ]);
      expect(snapshot?.executionTree?.toolInvocations?.length ?? 0).toBeGreaterThan(0);
    });

    const openDrawerButton = await screen.findByRole('button', {
      name: /open agent tools/i,
    });
    await user.click(openDrawerButton);

    const toolsDrawer = await screen.findByRole('dialog', {
      name: /agent tools/i,
    });

    const spawnedAgentsToggle = await within(toolsDrawer).findByRole(
      'button',
      {
        name: /toggle spawned agents for session 1/i,
      },
      { timeout: 10000 },
    );
    const expandIfCollapsed = async (button: HTMLElement) => {
      if (button.getAttribute('aria-expanded') !== 'true') {
        await user.click(button);
      }
    };

    await expandIfCollapsed(spawnedAgentsToggle);

    const spawnedAgentsRegion = await within(toolsDrawer).findByRole(
      'region',
      {
        name: /spawned agents for session 1/i,
      },
      { timeout: 10000 },
    );
    expect(within(spawnedAgentsRegion).getByText(/primary agent/i)).toBeInTheDocument();

    const runningToggle = await within(toolsDrawer).findByRole('button', {
      name: /running tool invocations/i,
    });

    await user.click(runningToggle);

    const runningRegion = await within(toolsDrawer).findByRole('region', {
      name: /running tool invocations for primary agent/i,
    });

    expect(
      within(runningRegion).getByText(/web_search/i),
    ).toBeInTheDocument();
    expect(
      within(runningRegion).getByText(/latest docs/i),
    ).toBeInTheDocument();

    await act(async () => {
      toolResultHandlers.forEach((handler) =>
        handler({
          sessionId: 'session-1',
          id: 'call-1',
          name: 'web_search',
          result: JSON.stringify({ content: 'done' }),
          timestamp: '2024-05-01T12:02:00.000Z',
          agentId: 'agent-primary',
        }),
      );
    });

    await waitFor(() => {
      expect(
        within(toolsDrawer).getByRole('button', {
          name: /completed tool invocations/i,
        }),
      ).toBeInTheDocument();
    });

    const completedToggle = within(toolsDrawer).getByRole('button', {
      name: /completed tool invocations/i,
    });
    await user.click(completedToggle);

    const completedRegion = await within(toolsDrawer).findByRole('region', {
      name: /completed tool invocations for primary agent/i,
    });

    expect(
      within(completedRegion).getByText(/web_search/i),
    ).toBeInTheDocument();
    expect(
      within(completedRegion).getByText(/done/i),
    ).toBeInTheDocument();
  }, 20000);
});
