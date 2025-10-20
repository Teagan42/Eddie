import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ChatSessionsPanel } from '../../src/overview/ChatSessionsPanel';
import { renderWithUIProviders } from '../test-utils';

interface SessionFixture {
  id: string;
  title: string;
  updatedAt: string;
}

interface MessageFixture {
  id: string;
  content: string;
  createdAt: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  name?: string | null;
}

describe('ChatSessionsPanel', () => {
  function createSession(partial?: Partial<SessionFixture>): SessionFixture {
    return {
      id: 'session-1',
      title: 'First Session',
      updatedAt: new Date().toISOString(),
      ...partial,
    } satisfies SessionFixture;
  }

  function createMessage(partial?: Partial<MessageFixture>): MessageFixture {
    return {
      id: 'message-1',
      content: 'Hello world',
      createdAt: new Date().toISOString(),
      role: 'assistant',
      ...partial,
    } satisfies MessageFixture;
  }

  it('renders empty states when no sessions or messages are present', () => {
    renderWithUIProviders(
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

  it('calls onSelectSession when a session is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const sessions = [createSession({ id: 'session-123', title: 'Important session' })];

    renderWithUIProviders(
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

    await user.click(screen.getByRole('button', { name: /Important session/i }));

    expect(onSelect).toHaveBeenCalledWith('session-123');
  });

  it('submits messages through the provided callback', () => {
    const onSubmit = vi.fn();
    const onChange = vi.fn();
    const session = createSession();
    const message = createMessage();

    renderWithUIProviders(
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
    fireEvent.change(textarea, { target: { value: 'Updated draft' } });
    expect(onChange).toHaveBeenCalledWith('Updated draft');

    fireEvent.submit(textarea.closest('form') as HTMLFormElement);

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
