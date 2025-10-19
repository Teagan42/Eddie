export type ChatMessageRole = "user" | "assistant" | "system" | "tool";

export interface ChatMessageMetadataAgent {
  id?: string | null;
  name?: string | null;
  parentId?: string | null;
  parentName?: string | null;
  lineage?: Array<string | { id?: string | null; name?: string | null }> | null;
}

export interface ChatMessageMetadataTool {
  id?: string | null;
  name?: string | null;
  status?: string | null;
}

export interface ChatMessageReasoningSegment {
  text?: string;
  metadata?: Record<string, unknown>;
  timestamp?: string;
  agentId?: string | null;
}

export interface ChatMessageReasoning {
  segments?: ChatMessageReasoningSegment[];
  responseId?: string;
  status?: "streaming" | "completed";
} | null;

export interface ChatMessage {
  id: string;
  role: ChatMessageRole;
  content: string;
  createdAt: string;
  updatedAt: string;
  name?: string | null;
  toolCallId?: string | null;
  metadata?: {
    agent?: ChatMessageMetadataAgent | null;
    tool?: ChatMessageMetadataTool | null;
  } | null;
  reasoning?: ChatMessageReasoning;
}
