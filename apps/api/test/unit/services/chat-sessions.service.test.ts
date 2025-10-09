import { describe, expect, it } from "vitest";
import { ChatSessionsService } from "../../../src/chat-sessions/chat-sessions.service";
import { CreateChatSessionDto } from "../../../src/chat-sessions/dto/create-chat-session.dto";
import { CreateChatMessageDto } from "../../../src/chat-sessions/dto/create-chat-message.dto";

class ListenerSpy {
  created = 0;
  updated = 0;
  messages = 0;

  onSessionCreated(): void {
    this.created += 1;
  }

  onSessionUpdated(): void {
    this.updated += 1;
  }

  onMessageCreated(): void {
    this.messages += 1;
  }
}

describe("ChatSessionsService", () => {
  it("creates sessions and notifies listeners", () => {
    const service = new ChatSessionsService();
    const listener = new ListenerSpy();
    service.registerListener(listener);

    const dto: CreateChatSessionDto = { title: "My Session" };
    const session = service.createSession(dto);

    expect(session.title).toBe("My Session");
    expect(listener.created).toBe(1);
    expect(listener.updated).toBe(0);

    const messageDto: CreateChatMessageDto = {
      role: "user",
      content: "Hello world",
    };
    const { message } = service.addMessage(session.id, messageDto);

    expect(message.content).toBe("Hello world");
    expect(listener.messages).toBe(1);
    expect(listener.updated).toBe(1);
  });

  it("persists tool identifiers and names on stored messages", () => {
    const service = new ChatSessionsService();
    const session = service.createSession({ title: "Tool capture" });

    const dto = {
      role: "tool",
      content: "{}",
      toolCallId: "call-1",
      name: "bash",
    } as CreateChatMessageDto;

    const { message } = service.addMessage(session.id, dto);

    expect((message as Record<string, unknown>).toolCallId).toBe("call-1");
    expect((message as Record<string, unknown>).name).toBe("bash");

    const [stored] = service.listMessages(session.id);
    expect((stored as Record<string, unknown>).toolCallId).toBe("call-1");
    expect((stored as Record<string, unknown>).name).toBe("bash");
  });
});
