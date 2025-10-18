import { render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import type { ChatMessageDto, ChatSessionDto } from "@eddie/api-client";
import { SessionDetail } from "../components";

class ResizeObserverMock {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

Object.assign(globalThis, { ResizeObserver: ResizeObserverMock });

describe("SessionDetail", () => {
  function createSession(partial?: Partial<ChatSessionDto>): ChatSessionDto {
    return {
      id: "session-1",
      title: "Session 1",
      description: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...partial,
    };
  }

  function createMessage(partial?: Partial<ChatMessageDto>): ChatMessageDto {
    return {
      id: "message-1",
      sessionId: "session-1",
      role: "user",
      content: "Hello world",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...partial,
    };
  }

  it("renders completed messages as individual cards with agent headings", () => {
    const session = createSession();
    const messages = [
      createMessage({
        id: "message-1",
        role: "assistant",
        name: "Orchestrator",
        content: "Working on it…",
        event: "delta",
      } as ChatMessageDto & { event?: string }),
      createMessage({
        id: "message-1",
        role: "assistant",
        name: "Orchestrator",
        content: "Task complete",
        event: "end",
      } as ChatMessageDto & { event?: string }),
      createMessage({
        id: "message-2",
        role: "assistant",
        name: "Delegate",
        content: "Providing support",
        event: "end",
      } as ChatMessageDto & { event?: string }),
    ];

    const { queryByText, getAllByTestId } = render(
      <SessionDetail session={session} isLoading={false} messages={messages} />
    );

    expect(queryByText("Working on it…")).not.toBeInTheDocument();

    const cards = getAllByTestId("message-card");
    expect(cards).toHaveLength(2);
    expect(within(cards[0]!).getByText(/Orchestrator/i)).toBeInTheDocument();
    expect(within(cards[0]!).getByText("Task complete")).toBeInTheDocument();
    expect(within(cards[1]!).getByText(/Delegate/i)).toBeInTheDocument();
    expect(within(cards[1]!).getByText("Providing support")).toBeInTheDocument();
  });

  it("scrolls the latest message into view when new messages arrive", async () => {
    const original = HTMLElement.prototype.scrollIntoView;
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    const session = createSession();
    const initialMessages = [createMessage({ id: "message-1" })];
    const { rerender } = render(
      <SessionDetail session={session} isLoading={false} messages={initialMessages} />
    );

    scrollIntoView.mockClear();

    rerender(
      <SessionDetail
        session={session}
        isLoading={false}
        messages={[...initialMessages, createMessage({ id: "message-2", content: "Another" })]}
      />
    );

    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalled();
    });

    HTMLElement.prototype.scrollIntoView = original;
  });

  it("keeps the latest message visible while it streams updates", async () => {
    const original = HTMLElement.prototype.scrollIntoView;
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    const session = createSession();
    const initialMessages = [createMessage({ id: "message-1", content: "Partial" })];
    const { rerender } = render(
      <SessionDetail session={session} isLoading={false} messages={initialMessages} />
    );

    scrollIntoView.mockClear();

    rerender(
      <SessionDetail
        session={session}
        isLoading={false}
        messages={[createMessage({ id: "message-1", content: "Partial update complete" })]}
      />
    );

    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalled();
    });

    HTMLElement.prototype.scrollIntoView = original;
  });

  it("renders a card for each completed message with the agent heading", () => {
    const session = createSession();
    const messages = [
      createMessage({
        id: "message-1",
        role: "assistant",
        name: "Agent Alpha",
        content: "First response",
      }),
      createMessage({
        id: "message-2",
        role: "assistant",
        name: "Agent Beta",
        content: "Second response",
      }),
    ];

    render(
      <SessionDetail session={session} isLoading={false} messages={messages} />
    );

    expect(screen.getAllByTestId("session-message-card")).toHaveLength(
      messages.length
    );
    expect(screen.getAllByText("Agent Alpha")).toHaveLength(1);
    expect(screen.getByText("Agent Beta")).toBeInTheDocument();
  });
});
