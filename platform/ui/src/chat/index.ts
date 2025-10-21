type UnknownProps = Record<string, unknown>;

export interface AgentExecutionTreeProps extends UnknownProps {}

export interface ChatWindowProps extends UnknownProps {}

export interface CollapsiblePanelProps extends UnknownProps {}

export { MessageComposer, type MessageComposerProps } from "./MessageComposer";

export interface SessionSelectorProps extends UnknownProps {}

function notImplemented(name: string): never {
  throw new Error(`${name} not yet implemented`);
}

export function AgentExecutionTree(): never {
  return notImplemented("AgentExecutionTree");
}

export function ChatWindow(): never {
  return notImplemented("ChatWindow");
}

export function CollapsiblePanel(): never {
  return notImplemented("CollapsiblePanel");
}

export function SessionSelector(): never {
  return notImplemented("SessionSelector");
}

export * from "./types";
export * from "./theme";
export { SessionDetail, type SessionDetailProps } from "./SessionDetail";
export { ChatSessionsPanel, type ChatSessionsPanelProps } from "./ChatSessionsPanel";
