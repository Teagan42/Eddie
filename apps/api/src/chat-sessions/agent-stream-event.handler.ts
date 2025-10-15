import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";
import { AgentStreamEvent } from "@eddie/types";
import { ChatSessionStreamRendererService } from "./chat-session-stream-renderer.service";

@EventsHandler(AgentStreamEvent)
export class AgentStreamEventHandler implements IEventHandler<AgentStreamEvent> {
  constructor(
    private readonly streamRenderer: ChatSessionStreamRendererService,
  ) {}

  handle({ event }: AgentStreamEvent): void {
    this.streamRenderer.render(event);
  }
}
