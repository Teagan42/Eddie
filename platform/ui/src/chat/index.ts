type UnknownProps = Record<string, unknown>;

export interface AgentExecutionTreeProps extends UnknownProps {}

export { MessageComposer, type MessageComposerProps } from "./MessageComposer";
export {
  ChatMessageContent,
  type ChatMessageContentProps,
} from "./ChatMessageContent";
export {
  AgentActivityIndicator,
  type AgentActivityIndicatorProps,
  type AgentActivityState,
} from "./AgentActivityIndicator";
export {
  MessageList,
  type MessageListProps,
  type MessageListItem,
} from "./MessageList";
export {
  ChatWindow,
  type ChatWindowComposerRole,
  type ChatWindowProps,
} from "./ChatWindow";

export type { CollapsiblePanelProps } from "./CollapsiblePanel.types";
export { CollapsiblePanel } from "./CollapsiblePanel";
export { ContextBundlesPanel, type ContextBundlesPanelProps } from "./ContextBundlesPanel";

export interface SessionSelectorProps extends UnknownProps {}

function notImplemented(name: string): never {
  throw new Error(`${name} not yet implemented`);
}

export function AgentExecutionTree(): never {
  return notImplemented("AgentExecutionTree");
}

export function SessionSelector(): never {
  return notImplemented("SessionSelector");
}

export * from "./types";
export * from "./theme";
export { SessionDetail, type SessionDetailProps } from "./SessionDetail";
export { ChatSessionsPanel, type ChatSessionsPanelProps } from "./ChatSessionsPanel";
