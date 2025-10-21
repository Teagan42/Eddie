import { render, waitFor, within } from "@testing-library/react";
import { describe, expectTypeOf, it, vi } from "vitest";

import {
  SessionDetail,
  type SessionDetailProps,
  type ChatMessage,
  type ChatSession,
} from "../../src/chat";

class ResizeObserverMock {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

Object.assign(globalThis, { ResizeObserver: ResizeObserverMock });

type TestSession = ChatSession;
type TestMessage = ChatMessage;

type StreamingMessage = TestMessage & { event?: string };

type MessageWithMetadata = StreamingMessage & {
  metadata?: { agent?: { id?: string | null; name?: string | null } } | null;
};

function createSession(partial?: Partial<TestSession>): TestSession {
  return {
    id: "session-1",
    title: "Session 1",
    status: "active",
    description: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...partial,
  } satisfies TestSession;
}

function createMessage(partial?: Partial<MessageWithMetadata>): MessageWithMetadata {
  return {
    id: "message-1",
    sessionId: "session-1",
    role: "user",
    content: "Hello world",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...partial,
  } satisfies MessageWithMetadata;
}

describe("SessionDetail", () => {
  it("exposes typed props for session detail inputs", () => {
    expectTypeOf<SessionDetailProps>().toMatchTypeOf<{
      session: ChatSession | null;
      messages: ChatMessage[] | undefined;
      isLoading: boolean;
    }>();
  });

  it("renders completed messages as individual cards with agent headings", () => {
    const session = createSession();
    const messages: StreamingMessage[] = [
      createMessage({
        id: "message-1",
        role: "assistant",
        name: "Orchestrator",
        content: "Working on it…",
        event: "delta",
      }),
      createMessage({
        id: "message-1",
        role: "assistant",
        name: "Orchestrator",
        content: "Task complete",
        event: "end",
      }),
      createMessage({
        id: "message-2",
        role: "assistant",
        name: "Delegate",
        content: "Providing support",
        event: "end",
      }),
    ];

    const { queryByText, getAllByTestId } = render(
      <SessionDetail session={session} isLoading={false} messages={messages} />,
    );

    expect(queryByText("Working on it…")).not.toBeInTheDocument();

    const cards = getAllByTestId("message-card");
    expect(cards).toHaveLength(2);
    expect(within(cards[0]!).getByText(/Orchestrator/i)).toBeInTheDocument();
    expect(within(cards[0]!).getByText("Task complete")).toBeInTheDocument();
    expect(within(cards[1]!).getByText(/Delegate/i)).toBeInTheDocument();
    expect(within(cards[1]!).getByText("Providing support")).toBeInTheDocument();
  });

  it("uses agent metadata for message headings when available", () => {
    const session = createSession();
    const messages: MessageWithMetadata[] = [
      createMessage({
        id: "message-1",
        role: "assistant",
        content: "Drafting response",
        event: "delta",
        metadata: { agent: { id: "manager", name: "Manager" } },
      }),
      createMessage({
        id: "message-1",
        role: "assistant",
        content: "Final response",
        event: "end",
      }),
      createMessage({
        id: "message-2",
        role: "assistant",
        content: "Delegate reply",
        event: "end",
        metadata: { agent: { id: "delegate", name: "Delegate" } },
      }),
    ];

    const { getAllByTestId } = render(
      <SessionDetail session={session} isLoading={false} messages={messages} />,
    );

    const cards = getAllByTestId("message-card");
    expect(cards).toHaveLength(2);
    expect(within(cards[0]!).getByText(/^Manager$/i)).toBeInTheDocument();
    expect(within(cards[1]!).getByText(/^Delegate$/i)).toBeInTheDocument();
  });

  it("scrolls the latest message into view when new messages arrive", async () => {
    const original = HTMLElement.prototype.scrollIntoView;
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    const session = createSession();
    const initialMessages = [createMessage({ id: "message-1" })];
    const { rerender } = render(
      <SessionDetail session={session} isLoading={false} messages={initialMessages} />,
    );

    scrollIntoView.mockClear();

    rerender(
      <SessionDetail
        session={session}
        isLoading={false}
        messages={[
          ...initialMessages,
          createMessage({ id: "message-2", content: "Another" }),
        ]}
      />,
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
      <SessionDetail session={session} isLoading={false} messages={initialMessages} />,
    );

    scrollIntoView.mockClear();

    rerender(
      <SessionDetail
        session={session}
        isLoading={false}
        messages={[
          createMessage({ id: "message-1", content: "Partial update complete" }),
        ]}
      />,
    );

    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalled();
    });

    HTMLElement.prototype.scrollIntoView = original;
  });
});
