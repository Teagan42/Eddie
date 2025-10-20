import type { ComponentType } from 'react';
import type { ChatMessageRole } from '../chat/types';

export interface AgentMetadata {
  id?: string | null;
  name?: string | null;
  parentId?: string | null;
  parentName?: string | null;
  lineage?: Array<string | { id?: string | null; name?: string | null } | null> | null;
}

export interface ToolMetadata {
  id?: string | null;
  name?: string | null;
  status?: string | null;
}

export interface MessageMetadata {
  agent?: AgentMetadata | null;
  tool?: ToolMetadata | null;
}

export interface OverviewMessage {
  id: string;
  content: string;
  createdAt: string;
  role: ChatMessageRole;
  name?: string | null;
  event?: string | null;
  metadata?: MessageMetadata | null;
}

export interface OverviewSessionSummary {
  id: string;
  title: string;
  updatedAt: string;
}

export interface OverviewStat {
  label: string;
  value: number;
  hint: string;
  icon: ComponentType<{ className?: string }>;
}
