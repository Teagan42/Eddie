import { describe, expect, it } from 'vitest';

import { applyToolSocketEvent, createExecutionTreeState } from './execution-tree-state';

function createBaseState() {
  return createExecutionTreeState({
    sessionId: 'session-1',
    capturedAt: '2024-05-01T12:00:00.000Z',
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
}

describe('applyToolSocketEvent', () => {
  it('merges tool call lifecycle events into execution state with normalized timestamps', () => {
    const baseState = createBaseState();
    const callEvent = {
      sessionId: 'session-1',
      id: 'call-1',
      name: 'web-search',
      arguments: { query: 'docs' },
      agentId: 'manager',
      timestamp: '2024-05-01T12:00:01.000Z',
    };

    const pendingState = applyToolSocketEvent(baseState, callEvent, 'tool.call');

    expect(pendingState).not.toBe(baseState);
    expect(baseState.toolInvocations).toHaveLength(0);
    expect(pendingState.toolInvocations).toHaveLength(1);

    const pendingInvocation = pendingState.toolInvocations[0];
    expect(pendingInvocation).toMatchObject({
      id: 'call-1',
      name: 'web-search',
      status: 'pending',
      args: { query: 'docs' },
      createdAt: '2024-05-01T12:00:01.000Z',
      updatedAt: '2024-05-01T12:00:01.000Z',
    });
    expect(pendingInvocation.metadata?.agentId).toBe('manager');

    const resultEvent = {
      ...callEvent,
      result: { output: 'Done' },
      timestamp: '2024-05-01T12:00:05.000Z',
    };

    const completedState = applyToolSocketEvent(pendingState, resultEvent, 'tool.result');

    expect(completedState).not.toBe(pendingState);
    expect(pendingState.toolInvocations[0]?.status).toBe('pending');

    const completedInvocation = completedState.toolInvocations[0];
    expect(completedInvocation.status).toBe('completed');
    expect(completedInvocation.result).toEqual({ output: 'Done' });
    expect(completedInvocation.updatedAt).toBe('2024-05-01T12:00:05.000Z');
  });

  it('records spawn_subagent metadata and updates agent hierarchy', () => {
    const baseState = createBaseState();
    const spawnEvent = {
      sessionId: 'session-1',
      id: 'spawn-1',
      name: 'spawn_subagent',
      agentId: 'manager',
      result: {
        schema: 'eddie.tool.spawn_subagent.result.v1',
        metadata: {
          agentId: 'writer',
          provider: 'anthropic',
          model: 'claude-3-5-sonnet',
          name: 'Writer',
          finalMessage: 'Writer ready',
          contextBundleIds: ['bundle-1'],
        },
        data: {
          messageCount: 3,
          prompt: 'Draft documentation',
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
      timestamp: '2024-05-01T12:05:00.000Z',
    };

    const state = applyToolSocketEvent(baseState, spawnEvent, 'tool.result');

    const root = state.agentHierarchy[0]!;
    const manager = root.children?.[0];
    expect(manager).toBeDefined();
    if (!manager) {
      throw new Error('Manager agent missing from hierarchy');
    }
    expect(manager.children).toHaveLength(1);
    const spawned = manager.children?.[0];
    expect(spawned).toBeDefined();
    if (!spawned) {
      throw new Error('Spawned agent missing from hierarchy');
    }
    expect(spawned.id).toBe('writer');
    expect(spawned.name).toBe('Writer');
    expect(spawned.provider).toBe('anthropic');
    expect(spawned.model).toBe('claude-3-5-sonnet');
    expect(spawned.metadata?.finalMessage).toBe('Writer ready');
    expect(spawned.metadata?.prompt).toBe('Draft documentation');
    expect(spawned.metadata?.messageCount).toBe(3);
    expect(spawned.metadata?.contextBundleIds).toEqual(['bundle-1']);

    const bundle = state.contextBundles.find((entry) => entry.id === 'bundle-1');
    expect(bundle).toMatchObject({
      title: 'Writer brief',
      source: 'spawn',
    });
    expect(bundle?.metadata).toEqual({ stage: 'delegation' });
  });
});
