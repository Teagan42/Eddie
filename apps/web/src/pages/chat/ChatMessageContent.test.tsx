import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChatMessageContent } from "./ChatMessageContent";

describe("ChatMessageContent", () => {
  it("renders bold markdown emphasis", () => {
    render(
      <ChatMessageContent
        messageRole="assistant"
        content="Hello **friend**"
        className="text-slate-100"
      />
    );

    const strongElement = screen.getByText("friend", { selector: "strong" });
    const content = screen.getByTestId("chat-message-content");

    expect(content.dataset.chatRole).toEqual("assistant");

    expect(strongElement).toBeInTheDocument();
  });

  it("renders fenced code blocks with semantic markup", () => {
    render(
      <ChatMessageContent
        messageRole="assistant"
        content={"```ts\nconst greeting = 'hi';\n```"}
      />
    );

    const codeElement = screen.getByText("const greeting = 'hi';", {
      selector: "code",
    });
    const pre = codeElement.closest("pre");

    expect(pre).not.toBeNull();
    expect(pre).toHaveClass(
      "mt-4 overflow-x-auto rounded-lg bg-slate-900/70 p-4 font-mono text-sm"
    );
  });

  it("renders blockquotes distinctly from plain text", () => {
    render(
      <ChatMessageContent
        messageRole="assistant"
        content="> Inspiration strikes"
      />
    );

    const quoteText = screen.getByText("Inspiration strikes");
    const blockquote = quoteText.closest("blockquote");

    expect(blockquote).not.toBeNull();
    expect(blockquote).toHaveClass(
      "mt-4 border-l-2 border-slate-500/80 pl-4 text-slate-200/90"
    );
  });

  it("styles inline code distinctly from surrounding prose", () => {
    render(
      <ChatMessageContent
        messageRole="assistant"
        content="Use `pnpm install` to setup"
      />
    );

    const inlineCode = screen.getByText("pnpm install", { selector: "code" });

    expect(inlineCode).toHaveClass(
      "rounded bg-slate-900/70 px-1 font-mono text-sm text-slate-100"
    );
  });

  it("renders unordered lists with disc bullets", () => {
    render(
      <ChatMessageContent
        messageRole="assistant"
        content={"- first item\n- second item"}
      />
    );

    const list = screen.getByRole("list");

    expect(list).toHaveClass("my-4 list-disc list-outside space-y-2 pl-6");
    expect(list.tagName).toBe("UL");
  });

  it("renders ordered lists with numeric markers", () => {
    render(
      <ChatMessageContent
        messageRole="assistant"
        content={"1. alpha\n2. beta"}
      />
    );

    const list = screen.getByRole("list");

    expect(list).toHaveClass("my-4 list-decimal list-outside space-y-2 pl-6");
    expect(list.tagName).toBe("OL");
  });

  it("applies data table styling to markdown tables", () => {
    render(
      <ChatMessageContent
        messageRole="assistant"
        content={"| Column | Value |\n| --- | --- |\n| Hello | World |"}
      />
    );

    const table = screen.getByRole("table");
    const wrapper = table.parentElement;
    const headerCell = screen.getByRole("columnheader", { name: "Column" });
    const bodyCell = screen.getByRole("cell", { name: "World" });

    expect(wrapper).not.toBeNull();
    expect(wrapper).toHaveClass("relative w-full overflow-auto");
    expect(table).toHaveClass("w-full caption-bottom text-sm");
    expect(headerCell).toHaveClass(
      "h-10 px-2 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]"
    );
    expect(bodyCell).toHaveClass(
      "p-2 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]"
    );
  });

  it("reduces spacing between markdown paragraphs", () => {
    render(
      <ChatMessageContent
        messageRole="assistant"
        content={"First paragraph.\n\nSecond paragraph."}
      />
    );

    const paragraphs = screen.getAllByText(/paragraph\./i, {
      selector: "p",
    });

    expect(paragraphs).toHaveLength(2);
    paragraphs.forEach((paragraph) => {
      expect(paragraph).toHaveClass("mb-2 last:mb-0 leading-relaxed");
    });
  });
});
