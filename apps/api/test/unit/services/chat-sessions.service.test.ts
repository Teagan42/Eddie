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

class ListenerSpy {
  created = 0;
  updated = 0;
  deleted = 0;
  deletedIds: string[] = [];
  messages = 0;
  messageUpdates = 0;

  onSessionCreated(): void {
    this.created += 1;
  }

  onSessionUpdated(): void {
    this.updated += 1;
  }

  onSessionDeleted(id: string): void {
    this.deleted += 1;
    this.deletedIds.push(id);
  }

  onMessageCreated(): void {
    this.messages += 1;
  }

  onMessageUpdated(): void {
    this.messageUpdates += 1;
  }
}

describe("ChatSessionsService", () => {
  let service: ChatSessionsService;

  beforeEach(() => {
    service = new ChatSessionsService(new InMemoryChatSessionsRepository());
  });

  it("exposes AgentInvocationSnapshot type to consumers", () => {
    expectTypeOf<AgentInvocationSnapshot>().toMatchTypeOf<
      RepositoryInvocationSnapshot
    >();
  });

  it("creates sessions and notifies listeners", async () => {
    const listener = new ListenerSpy();
    service.registerListener(listener);

    const dto: CreateChatSessionDto = { title: "My Session" };
    const session = await service.createSession(dto);

    expect(session.title).toBe("My Session");
    expect(listener.created).toBe(1);
    expect(listener.updated).toBe(0);

    const messageDto: CreateChatMessageDto = {
      role: "user",
      content: "Hello world",
    };
    const { message } = await service.addMessage(session.id, messageDto);

    expect(message.content).toBe("Hello world");
    expect(listener.messages).toBe(1);
    expect(listener.updated).toBe(1);
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
    const listener = new ListenerSpy();
    service.registerListener(listener);

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
    expect(listener.messageUpdates).toBe(1);
    expect(listener.updated).toBe(1);
    const messages = await service.listMessages(session.id);
    expect(messages[0]?.content).toBe("Final response");
  });

  it("updates session metadata and notifies listeners", async () => {
    const listener = new ListenerSpy();
    service.registerListener(listener);

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
    expect(listener.updated).toBe(1);
  });

  it("throws when renaming unknown sessions", async () => {
    await expect(
      (service as unknown as {
        renameSession(id: string, dto: { title?: string }): Promise<unknown>;
      }).renameSession("unknown", { title: "Updated" })
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("deletes sessions, cleans up messages, and notifies listeners", async () => {
    const listener = new ListenerSpy();
    service.registerListener(listener);

    const session = await service.createSession({ title: "Disposable" });
    await service.addMessage(session.id, { role: "user", content: "ping" });

    const before = listener.updated;

    await (service as unknown as { deleteSession(id: string): Promise<void> }).deleteSession(
      session.id
    );

    expect(listener.updated).toBe(before + 1);
    expect(listener.deleted).toBe(1);
    expect(listener.deletedIds).toEqual([session.id]);
    await expect(service.listMessages(session.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.getSession(session.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("throws when deleting unknown sessions", async () => {
    await expect(
      (service as unknown as { deleteSession(id: string): Promise<void> }).deleteSession("missing")
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
