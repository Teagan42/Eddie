import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { EventBus } from "@nestjs/cqrs";
import { ToolCallStore, type ToolCallState } from "../tool-call.store";
import { ToolCallStarted } from "../events/tool-call.events";
import { StartToolCallCommand } from "./start-tool-call.command";
import { ToolCallPersistenceService } from "../tool-call.persistence";

@CommandHandler(StartToolCallCommand)
export class StartToolCallHandler implements ICommandHandler<StartToolCallCommand> {
  constructor(
    private readonly store: ToolCallStore,
    private readonly eventBus: EventBus,
    private readonly persistence: ToolCallPersistenceService,
  ) {}

  async execute(command: StartToolCallCommand): Promise<ToolCallState> {
    const state = this.store.start(command.input);
    await this.persistence.recordStart(state);
    this.eventBus.publish(new ToolCallStarted(state));
    return state;
  }
}
