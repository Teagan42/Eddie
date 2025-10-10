import ReactMarkdown from "react-markdown";
import type { ChatMessageDto } from "@eddie/api-client";
import { cn } from "@/components/lib/utils";

type MessageRole = ChatMessageDto["role"];

interface ChatMessageContentProps {
  messageRole: MessageRole;
  content: string;
  className?: string;
}

export function ChatMessageContent({
  messageRole,
  content,
  className,
}: ChatMessageContentProps): JSX.Element {
  return (
    <div
      className={cn("whitespace-pre-wrap break-words", className)}
      data-chat-role={messageRole}
      data-testid="chat-message-content"
    >
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}
