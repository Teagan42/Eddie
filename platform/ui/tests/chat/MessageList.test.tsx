import { createRef } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@radix-ui/react-tooltip";

import { MessageList, type MessageListItem } from "../../src/chat";

function createMessage(partial?: Partial<MessageListItem>): MessageListItem {
  return {
    id: "message-1",
    sessionId: "session-1",
    role: "user",
    content: "Hello world",
    createdAt: new Date().toISOString(),
    ...partial,
  } as MessageListItem;
}

beforeAll(() => {
  class MockResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  // @ts-expect-error jsdom does not provide ResizeObserver
  global.ResizeObserver = MockResizeObserver;
});

describe("MessageList", () => {
  it("renders user messages and forwards reissue command", async () => {
    const user = userEvent.setup();
    const handleReissue = vi.fn();
    const message = createMessage({
      id: "message-user",
      content: "Retry me",
      role: "user",
    });

    render(
      <TooltipProvider>
        <MessageList
          messages={[message]}
          onReissueCommand={handleReissue}
          scrollAnchorRef={createRef<HTMLDivElement>()}
        />
      </TooltipProvider>,
    );

    const logRegion = screen.getByRole("log");
    expect(within(logRegion).getByText("Retry me")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Re-issue command" }));

    expect(handleReissue).toHaveBeenCalledWith(message);
  });

  it("summarizes tool messages and allows inspection", async () => {
    const user = userEvent.setup();
    const inspectToolInvocation = vi.fn();
    const toolMessage = createMessage({
      id: "message-tool",
      role: "tool",
      content: '{"result":"hidden"}',
      name: "web_search",
      toolCallId: "tool-1",
      metadata: {
        agent: {
          name: "Researcher",
          parentName: "Orchestrator",
        },
        tool: {
          id: "tool-1",
          name: "Browser",
          status: "completed",
        },
      },
    });

    render(
      <TooltipProvider>
        <MessageList
          messages={[toolMessage]}
          onReissueCommand={vi.fn()}
          scrollAnchorRef={createRef<HTMLDivElement>()}
          onInspectToolInvocation={inspectToolInvocation}
        />
      </TooltipProvider>,
    );

    const invocationButton = screen.getByRole("button", {
      name: /Browser tool invocation/,
    });
    expect(invocationButton).toBeInTheDocument();
    expect(screen.queryByText("hidden")).not.toBeInTheDocument();

    await user.click(invocationButton);

    expect(inspectToolInvocation).toHaveBeenCalledWith("tool-1");
  });

  it("renders reasoning segments with agent metadata", () => {
    const timestamp = "2024-01-01T12:34:00.000Z";
    const assistantMessage = createMessage({
      id: "assistant-1",
      role: "assistant",
      content: "final answer",
      metadata: {
        agent: {
          name: "Scout",
          parentName: "Lead Researcher",
        },
      },
      reasoning: {
        status: "streaming",
        segments: [
          {
            text: "Exploring options",
            timestamp,
            agentId: "agent-99",
          },
        ],
      },
    });

    render(
      <TooltipProvider>
        <MessageList
          messages={[assistantMessage]}
          onReissueCommand={vi.fn()}
          scrollAnchorRef={createRef<HTMLDivElement>()}
        />
      </TooltipProvider>,
    );

    const reasoning = screen.getByTestId("chat-message-reasoning");
    const segment = within(reasoning).getByTestId("chat-message-reasoning-segment");
    expect(within(segment).getByText("Agent Scout")).toBeVisible();
    expect(within(segment).getByText(/Reports to Lead Researcher/)).toBeVisible();
    expect(within(segment).getByText("Exploring options")).toBeVisible();
  });
});
