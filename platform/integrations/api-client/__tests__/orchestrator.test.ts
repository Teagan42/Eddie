import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

import { createApiClient } from '../src/index';
import type { OrchestratorMetadataDto } from '../src/index';
import type { ExecutionTreeState } from '@eddie/types';

type ExecutionTreePayload = NonNullable<OrchestratorMetadataDto['executionTree']>;
type RequiresExecutionTree = OrchestratorMetadataDto extends {
  executionTree?: ExecutionTreePayload;
}
  ? true
  : never;
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- compile-time assertion
const assertExecutionTree: RequiresExecutionTree = true;
type ExecutionTreeKeyPresent = 'executionTree' extends keyof OrchestratorMetadataDto
  ? true
  : never;
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- compile-time assertion
const assertExecutionTreeKey: ExecutionTreeKeyPresent = true;
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- compile-time assertion
const metadataExample: OrchestratorMetadataDto = {
  contextBundles: [],
  toolInvocations: [],
  agentHierarchy: [],
  executionTree: {
    agentHierarchy: [],
    toolInvocations: [],
    contextBundles: [],
    agentLineageById: {},
    toolGroupsByAgentId: {},
    contextBundlesByAgentId: {},
    contextBundlesByToolCallId: {},
    createdAt: '2024-05-01T00:00:00.000Z',
    updatedAt: '2024-05-01T00:00:00.000Z',
  } satisfies ExecutionTreePayload,
};

vi.mock('../src/realtime', () => {
  const close = vi.fn();
  const updateAuth = vi.fn();
  const on = vi.fn().mockReturnValue(() => {});
  const emit = vi.fn();

  return {
    createRealtimeChannel: vi.fn(() => ({
      on,
      emit,
      updateAuth,
      close,
    })),
  };
});

describe('createApiClient orchestrator metadata', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: (name: string) => (name === 'content-type' ? 'application/json' : null) },
      text: async () =>
        JSON.stringify({ contextBundles: [], toolInvocations: [], agentHierarchy: [] }),
      json: async () => ({
        contextBundles: [],
        toolInvocations: [],
        agentHierarchy: [],
        executionTree: {
          agentHierarchy: [],
          toolInvocations: [],
          contextBundles: [],
          agentLineageById: {},
          toolGroupsByAgentId: {},
          contextBundlesByAgentId: {},
          contextBundlesByToolCallId: {},
          createdAt: '2024-05-01T00:00:00.000Z',
          updatedAt: '2024-05-01T00:00:00.000Z',
        },
      }),
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    delete (globalThis as { fetch?: typeof fetch }).fetch;
  });

  it('returns execution tree snapshots when provided', async () => {
    const client = createApiClient({
      baseUrl: 'https://api.example.com',
      websocketUrl: 'wss://ws.example.com',
    });

    expectTypeOf<OrchestratorMetadataDto>().toMatchTypeOf<{
      executionTree: ExecutionTreeState | undefined;
    }>();

    const { executionTree, ...metadata } = await client.http.orchestrator.getMetadata(
      'session-1',
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/orchestrator/metadata?sessionId=session-1',
      expect.objectContaining({
        headers: expect.objectContaining({ Accept: 'application/json' }),
      }),
    );

    expect(executionTree).toEqual(expect.objectContaining({ agentHierarchy: [] }));

    expectTypeOf(metadata).toMatchTypeOf<{
      executionTree?: {
        agentHierarchy: unknown[];
      };
    }>();
  });
});
