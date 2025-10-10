import { describe, expect, it } from "vitest";
import type { ChatSessionsService } from "../../../src/chat-sessions/chat-sessions.service";
import { ChatMessageRole } from "../../../src/chat-sessions/dto/create-chat-message.dto";
import type {
  ChatMessageDto,
  ChatSessionDto,
} from "../../../src/chat-sessions/dto/chat-session.dto";
import { OrchestratorMetadataService } from "../../../src/orchestrator/orchestrator.service";
import { ToolCallStatusDto } from "../../../src/orchestrator/dto/orchestrator-metadata.dto";

describe("OrchestratorMetadataService", () => {
  it("includes tool call nodes when tool messages are present", async () => {
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
      getSession: async () => session,
      listMessages: async () => messages,
      listAgentInvocations: async () => [],
    } as unknown as ChatSessionsService;

    const service = new OrchestratorMetadataService(chatSessions);

    const metadata = await service.getMetadata(session.id);

    expect(metadata.toolInvocations).toHaveLength(1);
    expect(metadata.toolInvocations[0]?.name).toBe("formatter");
  });

  it("uses the recorded tool call id for metadata nodes", async () => {
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
      getSession: async () => session,
      listMessages: async () => enrichedMessages,
      listAgentInvocations: async () => [],
    } as unknown as ChatSessionsService;

    const service = new OrchestratorMetadataService(chatSessions);

    const metadata = await service.getMetadata(session.id);

    expect(metadata.toolInvocations).toHaveLength(1);
    expect(metadata.toolInvocations[0]?.id).toBe("call-123");
  });

  it("nests tool invocations beneath their spawning calls", async () => {
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
      getSession: async () => session,
      listMessages: async () => messages,
      listAgentInvocations: async () => agentInvocations,
    } as unknown as ChatSessionsService;

    const service = new OrchestratorMetadataService(chatSessions);

    const metadata = await service.getMetadata(session.id);

    expect(metadata.toolInvocations).toHaveLength(1);
    const spawnNode = metadata.toolInvocations[0];
    expect(spawnNode?.name).toBe("spawn_subagent");
    expect(spawnNode?.children).toHaveLength(1);
    const [childNode] = spawnNode?.children ?? [];
    expect(childNode?.id).toBe("call-bash");
    expect(childNode?.name).toBe("bash");
  });

  it("marks agent tool requests without responses as pending", async () => {
    const session: ChatSessionDto = {
      id: "session-pending",
      title: "Pending tool calls",
      status: "active",
      createdAt: new Date("2024-03-01T00:00:00.000Z").toISOString(),
      updatedAt: new Date("2024-03-01T00:00:00.000Z").toISOString(),
    };

    const agentInvocations = [
      {
        id: "manager",
        messages: [
          {
            role: ChatMessageRole.Assistant,
            content: JSON.stringify({
              schema: "eddie.tool.command.request.v1",
              content: "List workspace files",
            }),
            name: "bash",
            toolCallId: "call-pending",
          },
        ],
        children: [],
      },
    ];

    const chatSessions = {
      getSession: async () => session,
      listMessages: async () => [],
      listAgentInvocations: async () => agentInvocations,
    } as unknown as ChatSessionsService;

    const service = new OrchestratorMetadataService(chatSessions);

    const metadata = await service.getMetadata(session.id);
    const [pendingNode] = metadata.toolInvocations;

    expect(pendingNode?.status).toBe(ToolCallStatusDto.Pending);
    expect(pendingNode?.metadata?.preview).toContain("List workspace files");
    expect(pendingNode?.metadata?.toolName).toBe("bash");
    expect(pendingNode?.metadata?.payload).toBeUndefined();
  });

  it(
    "marks agent tool responses as completed when paired with tool output",
    async () => {
    const session: ChatSessionDto = {
      id: "session-completed",
      title: "Completed tool calls",
      status: "active",
      createdAt: new Date("2024-03-02T00:00:00.000Z").toISOString(),
      updatedAt: new Date("2024-03-02T00:00:00.000Z").toISOString(),
    };

    const agentInvocations = [
      {
        id: "manager",
        messages: [
          {
            role: ChatMessageRole.Assistant,
            content: JSON.stringify({
              schema: "eddie.tool.command.request.v1",
              content: "List workspace files",
            }),
            name: "bash",
            toolCallId: "call-complete",
          },
          {
            role: ChatMessageRole.Tool,
            content: JSON.stringify({
              schema: "eddie.tool.command.result.v1",
              content: "README.md\npackage.json",
            }),
            name: "bash",
            toolCallId: "call-complete",
          },
        ],
        children: [],
      },
    ];

    const chatSessions = {
      getSession: async () => session,
      listMessages: async () => [],
      listAgentInvocations: async () => agentInvocations,
    } as unknown as ChatSessionsService;

    const service = new OrchestratorMetadataService(chatSessions);

    const metadata = await service.getMetadata(session.id);
    const [completedNode] = metadata.toolInvocations;

    expect(completedNode?.status).toBe(ToolCallStatusDto.Completed);
    expect(completedNode?.metadata?.payload).toEqual({
      schema: "eddie.tool.command.result.v1",
      content: "README.md\npackage.json",
    });
  });

  it("includes both pending and completed tool calls when mixed", async () => {
    const session: ChatSessionDto = {
      id: "session-mixed",
      title: "Mixed tool calls",
      status: "active",
      createdAt: new Date("2024-03-03T00:00:00.000Z").toISOString(),
      updatedAt: new Date("2024-03-03T00:00:00.000Z").toISOString(),
    };

    const agentInvocations = [
      {
        id: "manager",
        messages: [
          {
            role: ChatMessageRole.Assistant,
            content: JSON.stringify({
              schema: "eddie.tool.command.request.v1",
              content: "List workspace files",
            }),
            name: "bash",
            toolCallId: "call-pending",
          },
          {
            role: ChatMessageRole.Assistant,
            content: JSON.stringify({
              schema: "eddie.tool.command.request.v1",
              content: "Summarise README",
            }),
            name: "summarise",
            toolCallId: "call-complete",
          },
          {
            role: ChatMessageRole.Tool,
            content: JSON.stringify({
              schema: "eddie.tool.command.result.v1",
              content: "README summary",
            }),
            name: "summarise",
            toolCallId: "call-complete",
          },
        ],
        children: [],
      },
    ];

    const chatSessions = {
      getSession: async () => session,
      listMessages: async () => [],
      listAgentInvocations: async () => agentInvocations,
    } as unknown as ChatSessionsService;

    const service = new OrchestratorMetadataService(chatSessions);

    const metadata = await service.getMetadata(session.id);
    const statuses = metadata.toolInvocations.map((node) => node.status);

    expect(statuses).toContain(ToolCallStatusDto.Pending);
    expect(statuses).toContain(ToolCallStatusDto.Completed);
  });
});
