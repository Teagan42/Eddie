type UnknownProps = Record<string, unknown>;

export interface AgentExecutionTreeProps extends UnknownProps {}

export interface ChatSessionsPanelProps extends UnknownProps {}

export interface ChatWindowProps extends UnknownProps {}

export interface CollapsiblePanelProps extends UnknownProps {}

export interface MessageComposerProps extends UnknownProps {}

export interface SessionDetailProps extends UnknownProps {}

export interface SessionSelectorProps extends UnknownProps {}

function notImplemented(name: string): never {
  throw new Error(`${name} not yet implemented`);
}

export function AgentExecutionTree(): never {
  return notImplemented("AgentExecutionTree");
}

export function ChatSessionsPanel(): never {
  return notImplemented("ChatSessionsPanel");
}

export function ChatWindow(): never {
  return notImplemented("ChatWindow");
}

export function CollapsiblePanel(): never {
  return notImplemented("CollapsiblePanel");
}

export function MessageComposer(): never {
  return notImplemented("MessageComposer");
}

export function SessionDetail(): never {
  return notImplemented("SessionDetail");
}

export function SessionSelector(): never {
  return notImplemented("SessionSelector");
}

export * from "./types";
export * from "./theme";
