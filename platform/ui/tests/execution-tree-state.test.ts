import { describe, expect, it } from 'vitest';

import { createEmptyExecutionTreeState } from './execution-tree-state';

describe('execution tree state fixtures', () => {
  it('provides an empty execution tree with stable defaults', () => {
    const state = createEmptyExecutionTreeState();

    expect(state).toMatchObject({
      agentHierarchy: [],
      toolInvocations: [],
      contextBundles: [],
      agentLineageById: {},
      toolGroupsByAgentId: {},
      contextBundlesByAgentId: {},
      contextBundlesByToolCallId: {},
    });
  });
});
