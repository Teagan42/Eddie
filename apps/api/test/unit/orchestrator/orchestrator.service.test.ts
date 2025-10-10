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
      listAgentInvocations: () => [],
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
      listAgentInvocations: () => [],
    } as unknown as ChatSessionsService;

    const service = new OrchestratorMetadataService(chatSessions);

    const metadata = service.getMetadata(session.id);

    expect(metadata.toolInvocations).toHaveLength(1);
    expect(metadata.toolInvocations[0]?.id).toBe("call-123");
  });

  it("nests tool invocations beneath their spawning calls", () => {
    const session: ChatSessionDto = {
      id: "session-3",
      title: "Delegation run",
      status: "active",
      createdAt: new Date("2024-02-01T00:00:00.000Z").toISOString(),
      updatedAt: new Date("2024-02-01T00:00:00.000Z").toISOString(),
    };

    const messages: ChatMessageDto[] = [];

    const agentInvocations = [
      {
        id: "manager",
        messages: [
          {
            role: ChatMessageRole.Assistant,
            content: "",
            name: "spawn_subagent",
            toolCallId: "call-spawn",
          },
          {
            role: ChatMessageRole.Tool,
            content: JSON.stringify({
              schema: "eddie.tool.spawn_subagent.result.v1",
              content: "Delegated to writer",
              metadata: { agentId: "writer", parentAgentId: "manager" },
            }),
            name: "spawn_subagent",
            toolCallId: "call-spawn",
          },
        ],
        children: [
          {
            id: "writer",
            messages: [
              {
                role: ChatMessageRole.Assistant,
                content: "",
                name: "bash",
                toolCallId: "call-bash",
              },
              {
                role: ChatMessageRole.Tool,
                content: "ls -la",
                name: "bash",
                toolCallId: "call-bash",
              },
            ],
            children: [],
          },
        ],
      },
    ];

    const chatSessions = {
      getSession: () => session,
      listMessages: () => messages,
      listAgentInvocations: () => agentInvocations,
    } as unknown as ChatSessionsService;

    const service = new OrchestratorMetadataService(chatSessions);

    const metadata = service.getMetadata(session.id);

    expect(metadata.toolInvocations).toHaveLength(1);
    const spawnNode = metadata.toolInvocations[0];
    expect(spawnNode?.name).toBe("spawn_subagent");
    expect(spawnNode?.children).toHaveLength(1);
    const [childNode] = spawnNode?.children ?? [];
    expect(childNode?.id).toBe("call-bash");
    expect(childNode?.name).toBe("bash");
  });
});
