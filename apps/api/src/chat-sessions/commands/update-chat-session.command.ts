import type { UpdateChatSessionDto } from "../dto/update-chat-session.dto";

export class UpdateChatSessionCommand {
  constructor(
    public readonly sessionId: string,
    public readonly dto: UpdateChatSessionDto,
  ) {}
}
