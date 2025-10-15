import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { EventBus } from "@nestjs/cqrs";
import { ToolCallStore, type ToolCallState } from "../tool-call.store";
import { ToolCallUpdated } from "../events/tool-call.events";
import { UpdateToolCallCommand } from "./update-tool-call.command";

@CommandHandler(UpdateToolCallCommand)
export class UpdateToolCallHandler implements ICommandHandler<UpdateToolCallCommand> {
  constructor(
    private readonly store: ToolCallStore,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: UpdateToolCallCommand): Promise<ToolCallState> {
    const state = this.store.update(command.input);
    this.eventBus.publish(new ToolCallUpdated(state));
    return state;
  }
}
