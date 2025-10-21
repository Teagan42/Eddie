import type { ExecutionTreeState } from "./types";

export function createExecutionTreeStateFromMetadata(
  metadata: unknown,
): ExecutionTreeState | null {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const executionTree = (metadata as { executionTree?: ExecutionTreeState | null }).executionTree;
  if (!executionTree) {
    return null;
  }

  return executionTree;
}
