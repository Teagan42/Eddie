import type { ExecutionTreeState } from '@eddie/types';

const EMPTY_STRING_DATE = new Date(0).toISOString();

export function createEmptyExecutionTreeState(): ExecutionTreeState {
  return {
    agentHierarchy: [],
    toolInvocations: [],
    contextBundles: [],
    agentLineageById: {},
    toolGroupsByAgentId: {},
    contextBundlesByAgentId: {},
    contextBundlesByToolCallId: {},
    createdAt: EMPTY_STRING_DATE,
    updatedAt: EMPTY_STRING_DATE,
  };
}
