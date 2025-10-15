import { NotFoundException } from "@nestjs/common";
import { describe, expect, expectTypeOf, it } from "vitest";
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
  AgentActivity,
  ChatMessageSent,
  ChatSessionCreated,
  ChatSessionDeleted,
  ChatSessionUpdated,
} from "../../../src/chat-sessions/events";

class EventBusStub {
  events: unknown[] = [];

  publish(event: unknown): void {
    this.events.push(event);
  }

  ofType<T>(ctor: new (...args: any[]) => T): T[] {
    return this.events.filter((event): event is T => event instanceof ctor);
  }
}

describe("ChatSessionsService", () => {
  let service: ChatSessionsService;
  let eventBus: EventBusStub;

  beforeEach(() => {
    eventBus = new EventBusStub();
    service = new ChatSessionsService(
      new InMemoryChatSessionsRepository(),
      eventBus as unknown as { publish: (event: unknown) => void }
    );
  });

  it("exposes AgentInvocationSnapshot type to consumers", () => {
    expectTypeOf<AgentInvocationSnapshot>().toMatchTypeOf<
      RepositoryInvocationSnapshot
    >();
  });

  it("creates sessions and publishes domain events", async () => {
    const dto: CreateChatSessionDto = { title: "My Session" };
    const session = await service.createSession(dto);

    expect(session.title).toBe("My Session");

    const [created] = eventBus.ofType(ChatSessionCreated);
    expect(created?.session.id).toBe(session.id);
    expect(created?.session.title).toBe("My Session");

    const messageDto: CreateChatMessageDto = {
      role: "user",
      content: "Hello world",
    };
    const { message } = await service.addMessage(session.id, messageDto);

    expect(message.content).toBe("Hello world");

    const [sent] = eventBus.ofType(ChatMessageSent);
    expect(sent?.sessionId).toBe(session.id);
    expect(sent?.message.id).toBe(message.id);
    expect(sent?.mode).toBe("created");

    const updates = eventBus
      .ofType(ChatSessionUpdated)
      .filter((event) => event.session.id === session.id);
    expect(updates.length).toBeGreaterThan(0);
  });

  it("persists tool identifiers and names on stored messages", async () => {
    const session = await service.createSession({ title: "Tool capture" });

    const dto = {
      role: "tool",
      content: "{}",
      toolCallId: "call-1",
      name: "bash",
    } as CreateChatMessageDto;

    const { message } = await service.addMessage(session.id, dto);

    expect((message as Record<string, unknown>).toolCallId).toBe("call-1");
    expect((message as Record<string, unknown>).name).toBe("bash");

    const [stored] = await service.listMessages(session.id);
    expect((stored as Record<string, unknown>).toolCallId).toBe("call-1");
    expect((stored as Record<string, unknown>).name).toBe("bash");
  });

  it("records agent invocation snapshots for orchestrator metadata", async () => {
    const session = await service.createSession({ title: "Delegation" });

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

    await service.saveAgentInvocations(session.id, snapshots);

    const stored = await service.listAgentInvocations(session.id);
    expect(stored).toEqual(snapshots);
    expect(stored).not.toBe(snapshots);
    expect(stored[0]).not.toBe(snapshots[0]);
    await expect(service.listAgentInvocations("unknown")).resolves.toEqual([]);
  });

  it("updates message content without reordering sessions", async () => {
    const session = await service.createSession({ title: "Streaming" });
    const { message } = await service.addMessage(session.id, {
      role: "assistant",
      content: "Partial",
    });

    const updated = await service.updateMessageContent(
      session.id,
      message.id,
      "Final response"
    );

    expect(updated.content).toBe("Final response");

    const messageEvents = eventBus
      .ofType(ChatMessageSent)
      .filter((event) => event.message.id === message.id && event.mode === "updated");
    expect(messageEvents.length).toBe(1);

    const messages = await service.listMessages(session.id);
    expect(messages[0]?.content).toBe("Final response");
  });

  it("updates session metadata and publishes updates", async () => {
    const session = await service.createSession({ title: "Original" });
    const renamed = await (service as unknown as {
      renameSession(
        id: string,
        dto: { title?: string; description?: string | null }
      ): Promise<{ id: string; title: string; description?: string }>;
    }).renameSession(session.id, {
      title: "Updated",
      description: "details",
    });

    expect(renamed.title).toBe("Updated");
    expect(renamed.description).toBe("details");

    const [updatedEvent] = eventBus.ofType(ChatSessionUpdated);
    expect(updatedEvent?.session.id).toBe(session.id);
    expect(updatedEvent?.session.title).toBe("Updated");
  });

  it("throws when renaming unknown sessions", async () => {
    await expect(
      (service as unknown as {
        renameSession(id: string, dto: { title?: string }): Promise<unknown>;
      }).renameSession("unknown", { title: "Updated" })
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("deletes sessions, cleans up messages, and publishes deletion event", async () => {
    const session = await service.createSession({ title: "Disposable" });
    await service.addMessage(session.id, { role: "user", content: "ping" });

    await (service as unknown as { deleteSession(id: string): Promise<void> }).deleteSession(
      session.id
    );

    const [deleted] = eventBus.ofType(ChatSessionDeleted);
    expect(deleted?.sessionId).toBe(session.id);

    await expect(service.listMessages(session.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.getSession(session.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("publishes agent activity events", async () => {
    const session = await service.createSession({ title: "With agent" });

    await service.setAgentActivity(session.id, "thinking");

    const [activity] = eventBus.ofType(AgentActivity);

    expect(activity?.sessionId).toBe(session.id);
    expect(activity?.state).toBe("thinking");
    expect(typeof activity?.timestamp).toBe("string");
  });

  it("throws when deleting unknown sessions", async () => {
    await expect(
      (service as unknown as { deleteSession(id: string): Promise<void> }).deleteSession(
        "missing"
      )
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
