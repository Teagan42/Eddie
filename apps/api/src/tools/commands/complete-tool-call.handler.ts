import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { EventBus } from "@nestjs/cqrs";
import { ToolCallStore, type ToolCallState } from "../tool-call.store";
import { ToolCallCompleted } from "../events/tool-call.events";
import { CompleteToolCallCommand } from "./complete-tool-call.command";
import { ToolCallPersistenceService } from "../tool-call.persistence";

@CommandHandler(CompleteToolCallCommand)
export class CompleteToolCallHandler implements ICommandHandler<CompleteToolCallCommand> {
  constructor(
    private readonly store: ToolCallStore,
    private readonly eventBus: EventBus,
    private readonly persistence: ToolCallPersistenceService,
  ) {}

  async execute(command: CompleteToolCallCommand): Promise<ToolCallState> {
    const state = this.store.complete(command.input);
    await this.persistence.recordComplete(state);
    this.eventBus.publish(new ToolCallCompleted(state));
    return state;
  }
}
