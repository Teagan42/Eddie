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
});
