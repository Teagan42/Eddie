import { describe, expect, expectTypeOf, it, vi } from "vitest";
import type { EventBus } from "@nestjs/cqrs";
import {
  ChatSessionsService,
  type AgentInvocationSnapshot,
} from "../../../src/chat-sessions/chat-sessions.service";
import { CreateChatSessionDto } from "../../../src/chat-sessions/dto/create-chat-session.dto";
import { CreateChatMessageDto } from "../../../src/chat-sessions/dto/create-chat-message.dto";
import {
  InMemoryChatSessionsRepository,
  type AgentInvocationSnapshot as RepositoryInvocationSnapshot,
} from "../../../src/chat-sessions/chat-sessions.repository";
import {
  ChatSessionCreatedEvent,
  ChatSessionUpdatedEvent,
  ChatMessageCreatedEvent,
} from "@eddie/types";

describe("ChatSessionsService", () => {
  let service: ChatSessionsService;
  let publishSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    publishSpy = vi.fn();
    service = new ChatSessionsService(
      new InMemoryChatSessionsRepository(),
      { publish: publishSpy } as unknown as EventBus
    );
  });

  it("exposes AgentInvocationSnapshot type to consumers", () => {
    expectTypeOf<AgentInvocationSnapshot>().toMatchTypeOf<
      RepositoryInvocationSnapshot
    >();
  });

  it("publishes lifecycle events through the EventBus", () => {
    const dto: CreateChatSessionDto = { title: "My Session" };
    const session = service.createSession(dto);

    expect(session.title).toBe("My Session");
    const createdEvent = publishSpy.mock.calls[0]?.[0];
    expect(createdEvent).toBeInstanceOf(ChatSessionCreatedEvent);
    expect(createdEvent).toMatchObject({ sessionId: session.id });

    const messageDto: CreateChatMessageDto = {
      role: "user",
      content: "Hello world",
    };
    const { message } = service.addMessage(session.id, messageDto);

    expect(message.content).toBe("Hello world");
    const messageEvent = publishSpy.mock.calls[1]?.[0];
    expect(messageEvent).toBeInstanceOf(ChatMessageCreatedEvent);
    expect(messageEvent).toMatchObject({
      sessionId: session.id,
      messageId: message.id,
    });

    const sessionUpdated = publishSpy.mock.calls[2]?.[0];
    expect(sessionUpdated).toBeInstanceOf(ChatSessionUpdatedEvent);
    expect(sessionUpdated).toMatchObject({
      sessionId: session.id,
      changedFields: expect.arrayContaining(["updatedAt"]),
    });

    publishSpy.mockClear();

    service.archiveSession(session.id);
    const archivedEvent = publishSpy.mock.calls[0]?.[0];
    expect(archivedEvent).toBeInstanceOf(ChatSessionUpdatedEvent);
    expect(archivedEvent).toMatchObject({
      sessionId: session.id,
      changedFields: expect.arrayContaining(["status"]),
    });

    const stored = service.listMessages(session.id);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.content).toBe("Hello world");
  });

  it("persists tool identifiers and names on stored messages", () => {
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

  it("records agent invocation snapshots for orchestrator metadata", () => {
    const session = service.createSession({ title: "Delegation" });

    const snapshots = [
      {
        id: "manager",
        messages: [
          {
            role: "assistant",
            content: "",
            name: "spawn_subagent",
            toolCallId: "call-spawn",
          },
        ],
        children: [
          {
            id: "writer",
            messages: [
              {
                role: "tool",
                content: "{}",
                name: "spawn_subagent",
                toolCallId: "call-spawn",
              },
            ],
            children: [],
          },
        ],
      },
    ];

    service.saveAgentInvocations(session.id, snapshots);

    const stored = service.listAgentInvocations(session.id);
    expect(stored).toEqual(snapshots);
    expect(stored).not.toBe(snapshots);
    expect(stored[0]).not.toBe(snapshots[0]);
    expect(service.listAgentInvocations("unknown")).toEqual([]);
  });

  it("updates message content without reordering sessions", () => {
    const session = service.createSession({ title: "Streaming" });
    const { message } = service.addMessage(session.id, {
      role: "assistant",
      content: "Partial",
    });

    const updated = service.updateMessageContent(
      session.id,
      message.id,
      "Final response"
    );

    expect(updated.content).toBe("Final response");
    expect(service.listMessages(session.id)[0]?.content).toBe("Final response");
  });
});
