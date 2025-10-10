import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import type { ChatMessageDto } from "@eddie/api-client";
import { cn } from "@/components/lib/utils";

const CODE_BLOCK_CONTAINER_CLASSES =
  "mt-4 overflow-x-auto rounded-lg bg-slate-900/70 p-4 font-mono text-sm";
const BLOCKQUOTE_CLASSES =
  "mt-4 border-l-2 border-slate-500/80 pl-4 text-slate-200/90";
const INLINE_CODE_CLASSES =
  "rounded bg-slate-900/70 px-1 font-mono text-sm text-slate-100";

const markdownComponents: Components = {
  code({ inline, className, children, ...props }) {
    const isCodeBlock = !inline && className?.includes("language-");

    if (!isCodeBlock) {
      return (
        <code className={cn(INLINE_CODE_CLASSES, className)} {...props}>
          {children}
        </code>
      );
    }

    return (
      <pre className={CODE_BLOCK_CONTAINER_CLASSES}>
        <code className={className} {...props}>
          {children}
        </code>
      </pre>
    );
  },
  blockquote({ className, children, ...props }) {
    return (
      <blockquote
        className={cn(BLOCKQUOTE_CLASSES, className)}
        {...props}
      >
        {children}
      </blockquote>
    );
  },
};

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
      <ReactMarkdown components={markdownComponents}>{content}</ReactMarkdown>
    </div>
  );
}
