import { render, screen } from "@testing-library/react";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import { describe, expect, it } from "vitest";

import { ChatWindow } from "../ChatWindow";
import { installResizeObserverMock } from "../../testing/installResizeObserverMock";

installResizeObserverMock();

describe("ChatWindow", () => {
  it("lists messages with their roles", () => {
    render(
      <TooltipProvider>
        <ChatWindow
          messages={[
            {
              id: "m1",
              role: "user",
              content: "Hello there",
              createdAt: new Date("2024-01-01T12:00:00Z").toISOString(),
              updatedAt: new Date("2024-01-01T12:00:00Z").toISOString(),
            },
            {
              id: "m2",
              role: "assistant",
              content: "Hi!",
              createdAt: new Date("2024-01-01T12:01:00Z").toISOString(),
              updatedAt: new Date("2024-01-01T12:01:00Z").toISOString(),
            },
          ]}
          composerPlaceholder="Type your next message"
          composerValue=""
          onComposerChange={() => {}}
          onComposerSubmit={() => {}}
          isComposerDisabled={false}
        />
      </TooltipProvider>
    );

    expect(screen.getByText("Hello there")).toBeVisible();
    expect(screen.getByText("Hi!")).toBeVisible();
    expect(screen.getByPlaceholderText("Type your next message")).toBeVisible();
  });
});
