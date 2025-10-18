import { Inject, Injectable } from "@nestjs/common";
import { EventBus } from "@nestjs/cqrs";
import { ExecutionTreeStateTracker } from "./execution-tree-tracker.service";
import {
  EXECUTION_TREE_CLOCK,
  type ExecutionTreeClock,
  type ExecutionTreeTrackerFactoryOptions,
} from "./execution-tree.tokens";

@Injectable()
export class ExecutionTreeTrackerFactory {
  constructor(
    private readonly eventBus: EventBus,
    @Inject(EXECUTION_TREE_CLOCK) private readonly clock: ExecutionTreeClock
  ) {}

  create(options: ExecutionTreeTrackerFactoryOptions = {}): ExecutionTreeStateTracker {
    return new ExecutionTreeStateTracker(this.eventBus, this.clock, options);
  }
}

export { EXECUTION_TREE_CLOCK } from "./execution-tree.tokens";
export type { ExecutionTreeClock, ExecutionTreeTrackerFactoryFn, ExecutionTreeTrackerFactoryOptions } from "./execution-tree.tokens";
