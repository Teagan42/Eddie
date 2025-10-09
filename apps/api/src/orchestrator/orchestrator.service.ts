import { Injectable } from "@nestjs/common";
import { ChatSessionsService } from "../chat-sessions/chat-sessions.service";
import {
  ContextBundleDto,
  OrchestratorMetadataDto,
  ToolCallNodeDto,
  ToolCallStatusDto,
  AgentHierarchyNodeDto,
} from "./dto/orchestrator-metadata.dto";

@Injectable()
export class OrchestratorMetadataService {
  constructor(private readonly chatSessions: ChatSessionsService) {}

  getMetadata(sessionId?: string): OrchestratorMetadataDto {
    if (!sessionId) {
      return this.createEmptySnapshot();
    }

    const session = this.chatSessions.getSession(sessionId);
    const messages = this.chatSessions.listMessages(sessionId);

    const contextBundles = this.createContextBundles(sessionId, messages.length);
    const toolInvocations = this.createToolInvocations(sessionId, messages);
    const agentHierarchy = this.createAgentHierarchy(session.title, sessionId, messages);

    return {
      sessionId,
      capturedAt: new Date().toISOString(),
      contextBundles,
      toolInvocations,
      agentHierarchy,
    };
  }

  private createEmptySnapshot(): OrchestratorMetadataDto {
    return {
      capturedAt: new Date().toISOString(),
      contextBundles: [],
      toolInvocations: [],
      agentHierarchy: [],
    };
  }

  private createContextBundles(
    sessionId: string,
    messageCount: number
  ): ContextBundleDto[] {
    return [
      {
        id: `${sessionId}-history`,
        label: "Session history",
        summary: `${messageCount} messages captured in runtime context`,
        sizeBytes: Math.max(messageCount * 280, 0),
        fileCount: 0,
      },
    ];
  }

  private createToolInvocations(
    sessionId: string,
    messages: ReturnType<ChatSessionsService["listMessages"]>
  ): ToolCallNodeDto[] {
    return messages
      .filter((message) => message.role !== "user")
      .map((message, index) => {
        const node = new ToolCallNodeDto();
        node.id = `${sessionId}-tool-${index}`;
        node.name = message.role === "system" ? "system_prompt" : "assistant_reply";
        node.status = ToolCallStatusDto.Completed;
        node.metadata = {
          preview: message.content.slice(0, 120),
          createdAt: message.createdAt,
        };
        node.children = [];
        return node;
      });
  }

  private createAgentHierarchy(
    title: string,
    sessionId: string,
    messages: ReturnType<ChatSessionsService["listMessages"]>
  ): AgentHierarchyNodeDto[] {
    const root = new AgentHierarchyNodeDto();
    root.id = sessionId;
    root.name = title;
    root.provider = "orchestrator";
    root.model = "delegator";
    root.depth = 0;
    root.metadata = { messageCount: messages.length };

    root.children = messages
      .filter((message) => message.role === "assistant")
      .map((message, index) => {
        const node = new AgentHierarchyNodeDto();
        node.id = `${sessionId}-agent-${index}`;
        node.name = `Responder ${index + 1}`;
        node.provider = "assistant";
        node.model = "runtime";
        node.depth = 1;
        node.metadata = {
          createdAt: message.createdAt,
        };
        node.children = [];
        return node;
      });

    return [root];
  }
}
