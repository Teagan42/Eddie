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

  type StreamEventLike = {
    type: "start" | "delta" | "end";
    text?: string;
    content?: string;
    timestamp?: string;
    agent?: { id?: string; name?: string; role?: ChatMessageDto["role"] };
  };

  function createStreamingMessage(events: StreamEventLike[] = []): ChatMessageDto & {
    events: StreamEventLike[];
  } {
    return {
      ...createMessage({ content: "" }),
      events,
    } as ChatMessageDto & { events: StreamEventLike[] };
  }

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

  it("renders a distinct message card for each completed agent response", () => {
    const session = createSession();
    const streamingMessage = createStreamingMessage([
      {
        type: "start",
        timestamp: new Date("2024-01-01T00:00:00Z").toISOString(),
        agent: { id: "agent-1", name: "Navigator", role: "assistant" },
      },
      {
        type: "delta",
        text: "Scout the area",
        timestamp: new Date("2024-01-01T00:00:02Z").toISOString(),
      },
      {
        type: "end",
        timestamp: new Date("2024-01-01T00:00:05Z").toISOString(),
        agent: { id: "agent-1", name: "Navigator", role: "assistant" },
      },
      {
        type: "start",
        timestamp: new Date("2024-01-01T00:01:00Z").toISOString(),
        agent: { id: "agent-2", name: "Builder", role: "assistant" },
      },
      {
        type: "delta",
        text: "Constructing shelter",
        timestamp: new Date("2024-01-01T00:01:03Z").toISOString(),
      },
      {
        type: "end",
        timestamp: new Date("2024-01-01T00:01:07Z").toISOString(),
        agent: { id: "agent-2", name: "Builder", role: "assistant" },
      },
    ]);

    render(
      <SessionDetail session={session} isLoading={false} messages={[streamingMessage]} />,
    );

    const cards = screen.getAllByTestId("session-detail-message-card");
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveTextContent("Navigator");
    expect(cards[0]).toHaveTextContent("Scout the area");
    expect(cards[1]).toHaveTextContent("Builder");
    expect(cards[1]).toHaveTextContent("Constructing shelter");
  });
});
