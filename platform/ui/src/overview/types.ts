export type OverviewMessageRole = "user" | "assistant" | "system" | "tool";

export interface OverviewSessionSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface OverviewMessageMetadataAgent {
  id?: string | null;
  name?: string | null;
}

export interface OverviewMessageMetadata {
  agent?: OverviewMessageMetadataAgent | null;
}

export interface OverviewMessage {
  id: string;
  role: OverviewMessageRole;
  content: string | null;
  createdAt: string;
  updatedAt: string;
  name?: string | null;
  event?: string | null;
  metadata?: OverviewMessageMetadata | null;
}
