import { Module } from "@nestjs/common";
import {
  EXECUTION_TREE_CLOCK,
  type ExecutionTreeClock,
  ExecutionTreeTrackerFactory,
} from "./execution-tree-tracker.factory";

const defaultClock: ExecutionTreeClock = () => new Date();

@Module({
  providers: [
    ExecutionTreeTrackerFactory,
    {
      provide: EXECUTION_TREE_CLOCK,
      useValue: defaultClock,
    },
  ],
  exports: [ExecutionTreeTrackerFactory],
})
export class ExecutionTreeModule {}
