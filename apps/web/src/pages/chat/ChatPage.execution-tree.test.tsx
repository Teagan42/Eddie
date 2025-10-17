import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createChatPageRenderer } from './test-utils';

const listSessionsMock = vi.fn();
const listMessagesMock = vi.fn();
const getMetadataMock = vi.fn();
const catalogMock = vi.fn();

let toolCallHandler: ((payload: Record<string, unknown>) => void) | null = null;
let toolResultHandler: ((payload: Record<string, unknown>) => void) | null = null;

class ResizeObserverMock {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

Object.defineProperty(globalThis, 'ResizeObserver', { value: ResizeObserverMock });

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
      },
      tools: {
        onToolCall: vi.fn((handler: (payload: Record<string, unknown>) => void) => {
          toolCallHandler = handler;
          return () => {};
        }),
        onToolResult: vi.fn((handler: (payload: Record<string, unknown>) => void) => {
          toolResultHandler = handler;
          return () => {};
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

async function waitForSessions(): Promise<void> {
  await waitFor(() => {
    expect(listSessionsMock).toHaveBeenCalled();
  });
}

describe('ChatPage execution tree realtime updates', () => {
  const timestamp = new Date('2024-05-01T12:00:00.000Z').toISOString();

  beforeEach(() => {
    vi.clearAllMocks();
    toolCallHandler = null;
    toolResultHandler = null;

    listSessionsMock.mockResolvedValue([
      {
        id: 'session-1',
        title: 'Session 1',
        description: null,
        status: 'active',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ]);
    listMessagesMock.mockResolvedValue([]);
    catalogMock.mockResolvedValue([]);
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
              id: 'manager',
              name: 'Manager',
              provider: 'openai',
              model: 'gpt-4o-mini',
              depth: 1,
              metadata: { messageCount: 0 },
              children: [],
            },
          ],
        },
      ],
    });
  });

  it('merges tool socket events into the agent execution tree', async () => {
    const user = userEvent.setup();
    renderChatPage();

    await waitFor(() => {
      expect(toolCallHandler).toBeTypeOf('function');
      expect(toolResultHandler).toBeTypeOf('function');
    });
    await waitForSessions();
    await waitFor(() => {
      expect(getMetadataMock).toHaveBeenCalled();
    });

    const rootSpawnToggle = await screen.findByRole('button', {
      name: /toggle spawned agents for session 1/i,
    });
    await user.click(rootSpawnToggle);

    await act(async () => {
      toolCallHandler?.({
        sessionId: 'session-1',
        id: 'call-1',
        name: 'web-search',
        arguments: { query: 'docs' },
        agentId: 'manager',
        timestamp,
      });
    });

    const pendingToggle = await screen.findByRole('button', {
      name: /toggle pending tool invocations for manager/i,
    });
    await user.click(pendingToggle);
    const pendingRegion = await screen.findByRole('region', {
      name: /pending tool invocations for manager/i,
    });
    expect(within(pendingRegion).getByText(/web-search/i)).toBeInTheDocument();

    await act(async () => {
      toolResultHandler?.({
        sessionId: 'session-1',
        id: 'call-1',
        name: 'spawn_subagent',
        agentId: 'manager',
        result: {
          schema: 'eddie.tool.spawn_subagent.result.v1',
          metadata: {
            agentId: 'writer',
            provider: 'anthropic',
            model: 'claude-3-5-sonnet',
            name: 'Writer',
            contextBundleIds: ['bundle-1'],
          },
          data: {
            messageCount: 2,
            prompt: 'Draft docs',
            contextBundles: [
              {
                id: 'bundle-1',
                title: 'Writer brief',
                source: 'spawn',
                metadata: { stage: 'delegation' },
              },
            ],
          },
        },
        timestamp: new Date('2024-05-01T12:05:00.000Z').toISOString(),
      });
    });

    const completedToggle = await screen.findByRole('button', {
      name: /toggle completed tool invocations for manager/i,
    });
    await user.click(completedToggle);
    const completedRegion = await screen.findByRole('region', {
      name: /completed tool invocations for manager/i,
    });
    expect(within(completedRegion).getByText(/spawn_subagent/i)).toBeInTheDocument();

    const spawnedToggle = screen.getByRole('button', {
      name: /toggle spawned agents for manager/i,
    });
    await user.click(spawnedToggle);
    expect(await screen.findByRole('button', { name: /select writer agent/i })).toBeInTheDocument();

    const contextToggle = screen.getByRole('button', {
      name: /toggle context bundles for manager/i,
    });
    await user.click(contextToggle);
    expect(await screen.findByText(/Writer brief/i)).toBeInTheDocument();
  });
});
