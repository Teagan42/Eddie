import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { composeExecutionTreeState } from './execution-tree-state';
import { createChatPageRenderer } from './test-utils';
import type { ExecutionTreeState } from '@eddie/types';

const listSessionsMock = vi.fn();
const listMessagesMock = vi.fn();
const getMetadataMock = vi.fn();
const catalogMock = vi.fn();

const toolCallHandlers: Array<(payload: unknown) => void> = [];
const toolResultHandlers: Array<(payload: unknown) => void> = [];
const executionTreeHandlers: Array<(payload: unknown) => void> = [];

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
        onExecutionTreeUpdated: vi.fn((handler: (payload: unknown) => void) => {
          executionTreeHandlers.push(handler);
          return () => {
            const index = executionTreeHandlers.indexOf(handler);
            if (index >= 0) {
              executionTreeHandlers.splice(index, 1);
            }
          };
        }),
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

    const spawnedAgentsToggle = await screen.findByRole(
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

    const spawnedAgentsRegion = await screen.findByRole(
      'region',
      {
        name: /spawned agents for session 1/i,
      },
      { timeout: 10000 },
    );
    expect(within(spawnedAgentsRegion).getByText(/primary agent/i)).toBeInTheDocument();

    const runningToggle = await screen.findByRole('button', {
      name: /running tool invocations/i,
    });

    await user.click(runningToggle);

    const runningRegion = await screen.findByRole('region', {
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
        screen.getByRole('button', {
          name: /completed tool invocations/i,
        }),
      ).toBeInTheDocument();
    });

    const completedToggle = screen.getByRole('button', {
      name: /completed tool invocations/i,
    });
    await user.click(completedToggle);

    const completedRegion = await screen.findByRole('region', {
      name: /completed tool invocations for primary agent/i,
    });

    expect(
      within(completedRegion).getByText(/web_search/i),
    ).toBeInTheDocument();
    expect(
      within(completedRegion).getByText(/done/i),
    ).toBeInTheDocument();
  }, 20000);

  it('synchronizes execution tree state from realtime updates', async () => {
    const user = userEvent.setup();
    const { client } = renderChatPage();

    await waitFor(() => {
      expect(executionTreeHandlers.length).toBeGreaterThan(0);
    });

    await waitFor(() => {
      expect(getMetadataMock).toHaveBeenCalled();
    });

    const executionTreeUpdate: ExecutionTreeState = composeExecutionTreeState(
      [
        {
          id: 'session-1',
          name: 'Session 1',
          provider: 'orchestrator',
          model: 'delegator',
          depth: 0,
          lineage: ['session-1'],
          children: [
            {
              id: 'delegate-agent',
              name: 'Delegate agent',
              provider: 'openai',
              model: 'gpt-4o',
              depth: 1,
              lineage: ['session-1', 'delegate-agent'],
              children: [],
            },
          ],
        },
      ],
      [
        {
          id: 'call-42',
          name: 'delegate_search',
          status: 'running',
          agentId: 'delegate-agent',
          createdAt: '2024-05-01T12:05:00.000Z',
          updatedAt: '2024-05-01T12:05:00.000Z',
          metadata: {
            args: { query: 'status report' },
          },
          children: [],
        },
      ],
      [],
      {
        createdAt: '2024-05-01T12:05:00.000Z',
        updatedAt: '2024-05-01T12:05:00.000Z',
      },
    );

    await act(async () => {
      executionTreeHandlers.forEach((handler) =>
        handler({ sessionId: 'session-1', state: executionTreeUpdate }),
      );
    });

    await waitFor(() => {
      const snapshot = client.getQueryData<{
        executionTree?: ExecutionTreeState | null;
      }>(['orchestrator-metadata', 'session-1']);
      expect(snapshot?.executionTree?.updatedAt).toBe(
        '2024-05-01T12:05:00.000Z',
      );
      expect(snapshot?.executionTree?.toolInvocations).toHaveLength(1);
    });

    const spawnedAgentsToggle = await screen.findByRole('button', {
      name: /toggle spawned agents for session 1/i,
    });

    if (spawnedAgentsToggle.getAttribute('aria-expanded') !== 'true') {
      await user.click(spawnedAgentsToggle);
    }

    const spawnedAgentsRegion = await screen.findByRole('region', {
      name: /spawned agents for session 1/i,
    });

    expect(
      within(spawnedAgentsRegion).getByText(/delegate agent/i),
    ).toBeInTheDocument();

    const runningToggle = await screen.findByRole('button', {
      name: /running tool invocations/i,
    });
    await user.click(runningToggle);

    const runningRegion = await screen.findByRole('region', {
      name: /running tool invocations for delegate agent/i,
    });

    expect(
      within(runningRegion).getByText(/delegate_search/i),
    ).toBeInTheDocument();
    expect(
      within(runningRegion).getByText(/status report/i),
    ).toBeInTheDocument();
  }, 20000);
});
