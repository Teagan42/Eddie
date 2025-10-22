import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, vi } from "vitest";

import { ChatSessionsPanel, type ChatSessionsPanelProps } from "../../src/chat";

class ResizeObserverMock {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

Object.assign(globalThis, { ResizeObserver: ResizeObserverMock });

type TestSession = ChatSessionsPanelProps["sessions"][number];
type TestMessage = ChatSessionsPanelProps["messages"][number];

function createSession(partial?: Partial<TestSession>): TestSession {
  return {
    id: "session-1",
    title: "First Session",
    description: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...partial,
  } as TestSession;
}

function createMessage(partial?: Partial<TestMessage>): TestMessage {
  return {
    id: "message-1",
    sessionId: "session-1",
    role: "user",
    content: "Hello world",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...partial,
  } as TestMessage;
}

describe("ChatSessionsPanel", () => {
  it("is exported from the chat barrel", () => {
    expect(typeof ChatSessionsPanel).toBe("function");
  });

  it("renders empty states when no sessions or messages are present", () => {
    render(
      <ChatSessionsPanel
        sessions={[]}
        selectedSessionId={null}
        onSelectSession={vi.fn()}
        onCreateSession={vi.fn()}
        newSessionTitle=""
        onNewSessionTitleChange={vi.fn()}
        isCreatingSession={false}
        activeSession={null}
        messages={[]}
        isMessagesLoading={false}
        onSubmitMessage={vi.fn()}
        messageDraft=""
        onMessageDraftChange={vi.fn()}
        isMessagePending={false}
      />,
    );

    expect(screen.getByText(/No sessions yet/i)).toBeInTheDocument();
    expect(screen.getByText(/No messages yet/i)).toBeInTheDocument();
  });

  it("calls onSelectSession when a session is clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const sessions = [createSession({ id: "session-123", title: "Important session" })];

    render(
      <ChatSessionsPanel
        sessions={sessions}
        selectedSessionId={null}
        onSelectSession={onSelect}
        onCreateSession={vi.fn()}
        newSessionTitle=""
        onNewSessionTitleChange={vi.fn()}
        isCreatingSession={false}
        activeSession={null}
        messages={[]}
        isMessagesLoading={false}
        onSubmitMessage={vi.fn()}
        messageDraft=""
        onMessageDraftChange={vi.fn()}
        isMessagePending={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Important session/i }));

    expect(onSelect).toHaveBeenCalledWith("session-123");
  });

  it("submits messages through the provided callback", () => {
    const onSubmit = vi.fn();
    const onChange = vi.fn();
    const session = createSession();
    const message = createMessage();

    render(
      <ChatSessionsPanel
        sessions={[session]}
        selectedSessionId={session.id}
        onSelectSession={vi.fn()}
        onCreateSession={vi.fn()}
        newSessionTitle=""
        onNewSessionTitleChange={vi.fn()}
        isCreatingSession={false}
        activeSession={session}
        messages={[message]}
        isMessagesLoading={false}
        onSubmitMessage={onSubmit}
        messageDraft="Test message"
        onMessageDraftChange={onChange}
        isMessagePending={false}
      />,
    );

    const textarea = screen.getByPlaceholderText(/Send a message/i);
    fireEvent.change(textarea, { target: { value: "Updated draft" } });
    expect(onChange).toHaveBeenCalledWith("Updated draft");

    fireEvent.submit(textarea.closest("form") as HTMLFormElement);

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
