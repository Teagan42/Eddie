import type { ExecutionTreeStateTracker } from "./execution-tree-tracker.service";

export type ExecutionTreeClock = () => Date;

export interface ExecutionTreeTrackerOptions {
  sessionId?: string;
}

export const EXECUTION_TREE_CLOCK = Symbol("EXECUTION_TREE_CLOCK");

export type ExecutionTreeTrackerFactoryOptions = ExecutionTreeTrackerOptions;

export type ExecutionTreeTrackerFactoryFn = (
  options: ExecutionTreeTrackerFactoryOptions
) => ExecutionTreeStateTracker;
