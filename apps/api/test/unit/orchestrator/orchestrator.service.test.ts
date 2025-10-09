import { describe, expect, it } from "vitest";
import type { ChatSessionsService } from "../../../src/chat-sessions/chat-sessions.service";
import { ChatMessageRole } from "../../../src/chat-sessions/dto/create-chat-message.dto";
import type {
  ChatMessageDto,
  ChatSessionDto,
} from "../../../src/chat-sessions/dto/chat-session.dto";
import { OrchestratorMetadataService } from "../../../src/orchestrator/orchestrator.service";

describe("OrchestratorMetadataService", () => {
  it("includes tool call nodes when tool messages are present", () => {
    const session: ChatSessionDto = {
      id: "session-1",
      title: "Formatter run",
      status: "active",
      createdAt: new Date("2024-01-01T00:00:00.000Z").toISOString(),
      updatedAt: new Date("2024-01-01T00:00:00.000Z").toISOString(),
    };

    const messages: ChatMessageDto[] = [
      {
        id: "message-user",
        sessionId: session.id,
        role: ChatMessageRole.User,
        content: "Run the formatter",
        createdAt: new Date("2024-01-01T00:05:00.000Z").toISOString(),
      },
      {
        id: "message-tool",
        sessionId: session.id,
        role: ChatMessageRole.Tool,
        content: "formatter --check",
        createdAt: new Date("2024-01-01T00:06:00.000Z").toISOString(),
      },
    ];

    const chatSessions = {
      getSession: () => session,
      listMessages: () => messages,
    } as unknown as ChatSessionsService;

    const service = new OrchestratorMetadataService(chatSessions);

    const metadata = service.getMetadata(session.id);

    expect(metadata.toolInvocations).toHaveLength(1);
    expect(metadata.toolInvocations[0]?.name).toBe("formatter");
  });

  it("uses the recorded tool call id for metadata nodes", () => {
    const session: ChatSessionDto = {
      id: "session-2",
      title: "Tool invocation tracking",
      status: "active",
      createdAt: new Date("2024-01-01T00:00:00.000Z").toISOString(),
      updatedAt: new Date("2024-01-01T00:00:00.000Z").toISOString(),
    };

    const messages: ChatMessageDto[] = [
      {
        id: "message-tool",
        sessionId: session.id,
        role: ChatMessageRole.Tool,
        content: "{}",
        createdAt: new Date("2024-01-01T00:06:00.000Z").toISOString(),
      },
    ];

    const enrichedMessages = messages.map((message) => ({
      ...message,
      toolCallId: "call-123",
    }));

    const chatSessions = {
      getSession: () => session,
      listMessages: () => enrichedMessages,
    } as unknown as ChatSessionsService;

    const service = new OrchestratorMetadataService(chatSessions);

    const metadata = service.getMetadata(session.id);

    expect(metadata.toolInvocations).toHaveLength(1);
    expect(metadata.toolInvocations[0]?.id).toBe("call-123");
  });
});
