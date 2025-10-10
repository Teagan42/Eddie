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
const TABLE_WRAPPER_CLASSES = "relative w-full overflow-auto";
const TABLE_CLASSES = "w-full caption-bottom text-sm";
const TABLE_HEADER_CLASSES = "[&_tr]:border-b";
const TABLE_BODY_CLASSES = "[&_tr:last-child]:border-0";
const TABLE_ROW_CLASSES =
  "border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted";
const TABLE_HEAD_CELL_CLASSES =
  "h-10 px-2 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]";
const TABLE_CELL_CLASSES =
  "p-2 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]";
const TABLE_CAPTION_CLASSES = "mt-4 text-sm text-muted-foreground";

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
  table({ className, children, ...props }) {
    return (
      <div className={TABLE_WRAPPER_CLASSES}>
        <table className={cn(TABLE_CLASSES, className)} {...props}>
          {children}
        </table>
      </div>
    );
  },
  thead({ className, ...props }) {
    return <thead className={cn(TABLE_HEADER_CLASSES, className)} {...props} />;
  },
  tbody({ className, ...props }) {
    return <tbody className={cn(TABLE_BODY_CLASSES, className)} {...props} />;
  },
  tr({ className, ...props }) {
    return <tr className={cn(TABLE_ROW_CLASSES, className)} {...props} />;
  },
  th({ className, ...props }) {
    return (
      <th
        className={cn(TABLE_HEAD_CELL_CLASSES, className)}
        scope="col"
        {...props}
      />
    );
  },
  td({ className, ...props }) {
    return <td className={cn(TABLE_CELL_CLASSES, className)} {...props} />;
  },
  caption({ className, ...props }) {
    return (
      <caption
        className={cn(TABLE_CAPTION_CLASSES, className)}
        {...props}
      />
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
