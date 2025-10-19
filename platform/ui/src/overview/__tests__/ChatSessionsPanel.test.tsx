import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ChatSessionsPanel } from "../ChatSessionsPanel";
import { installResizeObserverMock } from "../../testing/installResizeObserverMock";

installResizeObserverMock();

describe("ChatSessionsPanel", () => {
  const exampleSession = {
    id: "session-1",
    title: "First session",
    createdAt: new Date("2024-01-01T12:00:00Z").toISOString(),
    updatedAt: new Date("2024-01-01T12:30:00Z").toISOString(),
  };

  const exampleMessage = {
    id: "message-1",
    role: "assistant" as const,
    content: "Hello from the agent",
    createdAt: new Date("2024-01-01T12:05:00Z").toISOString(),
    updatedAt: new Date("2024-01-01T12:05:00Z").toISOString(),
  };

  it("renders the active session and forwards interactions", () => {
    const handleCreateSession = vi.fn((event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
    });
    const handleMessageSubmit = vi.fn((event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
    });
    const handleSelectSession = vi.fn();
    const handleMessageDraftChange = vi.fn();
    const handleNewSessionTitleChange = vi.fn();

    render(
      <ChatSessionsPanel
        sessions={[exampleSession]}
        selectedSessionId={exampleSession.id}
        onSelectSession={handleSelectSession}
        onCreateSession={handleCreateSession}
        newSessionTitle="Example"
        onNewSessionTitleChange={handleNewSessionTitleChange}
        isCreatingSession={false}
        activeSession={exampleSession}
        messages={[exampleMessage]}
        isMessagesLoading={false}
        onSubmitMessage={handleMessageSubmit}
        messageDraft=""
        onMessageDraftChange={handleMessageDraftChange}
        isMessagePending={false}
      />
    );

    expect(screen.getByText("Chat Sessions")).toBeVisible();
    expect(screen.getAllByText(exampleSession.title).length).toBeGreaterThan(0);
    expect(screen.getByText(exampleMessage.content)).toBeVisible();

    const newSessionTitleField = screen.getByPlaceholderText("Session title");
    fireEvent.change(newSessionTitleField, { target: { value: "New session" } });
    expect(handleNewSessionTitleChange).toHaveBeenCalledWith("New session");

    fireEvent.submit(newSessionTitleField.closest("form")!);
    expect(handleCreateSession).toHaveBeenCalled();

    const composerField = screen.getByPlaceholderText("Send a message");
    fireEvent.change(composerField, { target: { value: "Next message" } });
    expect(handleMessageDraftChange).toHaveBeenCalledWith("Next message");

    fireEvent.submit(composerField.closest("form")!);
    expect(handleMessageSubmit).toHaveBeenCalled();

    const sessionButton = screen.getByRole("button", { name: /First session/ });
    fireEvent.click(sessionButton);
    expect(handleSelectSession).toHaveBeenCalledWith(exampleSession.id);
  });
});
