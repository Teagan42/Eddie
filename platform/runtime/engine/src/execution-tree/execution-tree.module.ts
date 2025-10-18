import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import {
  EXECUTION_TREE_CLOCK,
  type ExecutionTreeClock,
  ExecutionTreeTrackerFactory,
} from "./execution-tree-tracker.factory";

const defaultClock: ExecutionTreeClock = () => new Date();

@Module({
  imports: [CqrsModule],
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
