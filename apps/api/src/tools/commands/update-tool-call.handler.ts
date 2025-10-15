import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { EventBus } from "@nestjs/cqrs";
import { ToolCallStore, type ToolCallState } from "../tool-call.store";
import { ToolCallUpdated } from "../events/tool-call.events";
import { UpdateToolCallCommand } from "./update-tool-call.command";
import { ToolCallPersistenceService } from "../tool-call.persistence";

@CommandHandler(UpdateToolCallCommand)
export class UpdateToolCallHandler implements ICommandHandler<UpdateToolCallCommand> {
  constructor(
    private readonly store: ToolCallStore,
    private readonly eventBus: EventBus,
    private readonly persistence: ToolCallPersistenceService,
  ) {}

  async execute(command: UpdateToolCallCommand): Promise<ToolCallState> {
    const state = this.store.update(command.input);
    await this.persistence.recordUpdate(state);
    this.eventBus.publish(new ToolCallUpdated(state));
    return state;
  }
}
