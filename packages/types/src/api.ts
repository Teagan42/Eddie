import type { JSONSchema7 } from "json-schema";
import type {
  ConfigFileFormat,
  EddieConfig,
  EddieConfigInput,
} from "./config";
import type { Role } from "./providers";

export interface ConfigSchemaPayload {
  id: string;
  version: string;
  schema: JSONSchema7;
  inputSchema: JSONSchema7;
}

export interface ConfigSourcePayload {
  path: string | null;
  format: ConfigFileFormat;
  content: string;
  input: EddieConfigInput;
  config: EddieConfig | null;
  error: string | null;
}

export interface ConfigPreviewPayload {
  input: EddieConfigInput;
  config: EddieConfig;
}

export interface ConfigSourceRequestPayload {
  content: string;
  format: ConfigFileFormat;
}

export interface AgentInvocationMessageSnapshot {
  role: Role;
  content: string;
  name?: string;
  toolCallId?: string;
}

export interface AgentInvocationSnapshot {
  id: string;
  messages: AgentInvocationMessageSnapshot[];
  children: AgentInvocationSnapshot[];
  provider?: string;
  model?: string;
}

export type ChatSessionStatus = "active" | "archived";

export interface ChatSessionSnapshot {
  id: string;
  title: string;
  description?: string;
  status: ChatSessionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessageSnapshot {
  id: string;
  sessionId: string;
  role: Role;
  content: string;
  createdAt: string;
  toolCallId?: string;
  name?: string;
}
