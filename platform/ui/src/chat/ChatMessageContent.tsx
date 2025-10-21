import type { ComponentPropsWithoutRef, ReactNode } from "react";

import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { JsonTreeView } from "../common";
import { combineClassNames } from "../utils/class-names";
import type { ChatMessageRole } from "./types";

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
const LIST_BASE_CLASSES = "my-4 list-outside space-y-2 pl-6";
const LIST_ITEM_CLASSES = "leading-relaxed marker:text-slate-300";
const PARAGRAPH_CLASSES = "my-2 leading-6 first:mt-0 last:mb-0";

const MARKDOWN_PLUGINS = [remarkGfm];

type MarkdownCodeProps = ComponentPropsWithoutRef<"code"> & {
  inline?: boolean;
  children?: ReactNode;
};

const markdownComponents: Components = {
  code(codeProps) {
    const { inline, className, children, ...props } = codeProps as MarkdownCodeProps;

    const isCodeBlock = !inline && className?.includes("language-");

    if (!isCodeBlock) {
      return (
        <code
          className={combineClassNames(INLINE_CODE_CLASSES, className)}
          {...props}
        >
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
        className={combineClassNames(BLOCKQUOTE_CLASSES, className)}
        {...props}
      >
        {children}
      </blockquote>
    );
  },
  table({ className, children, ...props }) {
    return (
      <div className={TABLE_WRAPPER_CLASSES}>
        <table
          className={combineClassNames(TABLE_CLASSES, className)}
          {...props}
        >
          {children}
        </table>
      </div>
    );
  },
  thead({ className, ...props }) {
    return (
      <thead
        className={combineClassNames(TABLE_HEADER_CLASSES, className)}
        {...props}
      />
    );
  },
  tbody({ className, ...props }) {
    return (
      <tbody
        className={combineClassNames(TABLE_BODY_CLASSES, className)}
        {...props}
      />
    );
  },
  tr({ className, ...props }) {
    return (
      <tr className={combineClassNames(TABLE_ROW_CLASSES, className)} {...props} />
    );
  },
  th({ className, ...props }) {
    return (
      <th
        className={combineClassNames(TABLE_HEAD_CELL_CLASSES, className)}
        scope="col"
        {...props}
      />
    );
  },
  td({ className, ...props }) {
    return (
      <td className={combineClassNames(TABLE_CELL_CLASSES, className)} {...props} />
    );
  },
  caption({ className, ...props }) {
    return (
      <caption
        className={combineClassNames(TABLE_CAPTION_CLASSES, className)}
        {...props}
      />
    );
  },
  ul({ className, ...props }) {
    return (
      <ul
        className={combineClassNames(LIST_BASE_CLASSES, "list-disc", className)}
        {...props}
      />
    );
  },
  ol({ className, ...props }) {
    return (
      <ol
        className={combineClassNames(LIST_BASE_CLASSES, "list-decimal", className)}
        {...props}
      />
    );
  },
  li({ className, ...props }) {
    return (
      <li className={combineClassNames(LIST_ITEM_CLASSES, className)} {...props} />
    );
  },
  p({ className, ...props }) {
    return (
      <p className={combineClassNames(PARAGRAPH_CLASSES, className)} {...props} />
    );
  },
};

export interface ChatMessageContentProps {
  messageRole: ChatMessageRole;
  content: string;
  className?: string;
}

export function ChatMessageContent({
  messageRole,
  content,
  className,
}: ChatMessageContentProps): JSX.Element {
  const { success: hasJsonContent, value: jsonValue } = parseJsonContent(content);
  const containerClassName = combineClassNames(
    "whitespace-pre-wrap break-words",
    className,
  );
  const renderedContent = hasJsonContent ? (
    <JsonTreeView
      value={jsonValue}
      collapsedByDefault
      className="mt-4 text-left"
      rootLabel={`${formatRoleLabel(messageRole)} message JSON`}
    />
  ) : (
    <ReactMarkdown components={markdownComponents} remarkPlugins={MARKDOWN_PLUGINS}>
      {content}
    </ReactMarkdown>
  );

  return (
    <div
      className={containerClassName}
      data-chat-role={messageRole}
      data-testid="chat-message-content"
    >
      {renderedContent}
    </div>
  );
}

interface JsonParseResult {
  success: boolean;
  value: unknown;
}

function parseJsonContent(content: string): JsonParseResult {
  const trimmed = content.trim();

  if (!trimmed) {
    return { success: false, value: null };
  }

  try {
    return { success: true, value: JSON.parse(trimmed) };
  } catch {
    return { success: false, value: null };
  }
}

function formatRoleLabel(role: ChatMessageRole): string {
  if (!role) {
    return "";
  }

  return role
    .split(/[_-]/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}
