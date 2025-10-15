import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { EventBus } from "@nestjs/cqrs";
import { ToolCallStore, type ToolCallState } from "../tool-call.store";
import { ToolCallStarted } from "../events/tool-call.events";
import { StartToolCallCommand } from "./start-tool-call.command";

@CommandHandler(StartToolCallCommand)
export class StartToolCallHandler implements ICommandHandler<StartToolCallCommand> {
  constructor(
    private readonly store: ToolCallStore,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: StartToolCallCommand): Promise<ToolCallState> {
    const state = this.store.start(command.input);
    this.eventBus.publish(new ToolCallStarted(state));
    return state;
  }
}
