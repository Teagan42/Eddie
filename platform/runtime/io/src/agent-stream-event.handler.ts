import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";
import { AgentStreamEvent } from "@eddie/types";
import { StreamRendererService } from "./stream-renderer.service";

@EventsHandler(AgentStreamEvent)
export class AgentStreamEventHandler implements IEventHandler<AgentStreamEvent> {
  constructor(private readonly streamRenderer: StreamRendererService) {}

  handle({ event }: AgentStreamEvent): void {
    this.streamRenderer.render(event);
  }
}
