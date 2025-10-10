import { render, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import type { ChatMessageDto, ChatSessionDto } from "@eddie/api-client";
import { SessionDetail } from "../components/SessionDetail";

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
});
