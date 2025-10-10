import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChatMessageContent } from "./ChatMessageContent";

describe("ChatMessageContent", () => {
  it("renders bold markdown emphasis", () => {
    render(
      <ChatMessageContent
        role="assistant"
        content="Hello **friend**"
        className="text-slate-100"
      />
    );

    const strongElement = screen.getByText("friend", { selector: "strong" });

    expect(strongElement).toBeInTheDocument();
  });
});
