import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ChatMessageDto } from '@eddie/api-client';

import { ChatWindow, type ChatWindowProps } from '../ChatWindow';

type RequiredProps = ChatWindowProps;

function createMessage(partial?: Partial<ChatMessageDto>): ChatMessageDto {
  return {
    id: 'message-1',
    sessionId: 'session-1',
    role: 'user',
    content: 'Test message',
    createdAt: new Date().toISOString(),
    ...partial,
  } as ChatMessageDto;
}

describe('ChatWindow', () => {
  function renderChatWindow(props?: Partial<RequiredProps>) {
    const defaultProps: RequiredProps = {
      messages: [createMessage()],
      composerValue: 'Hello world',
      onComposerChange: vi.fn(),
      onComposerSubmit: vi.fn(),
      onReissueCommand: vi.fn(),
      composerSubmitDisabled: false,
    };

    return render(<ChatWindow {...defaultProps} {...props} />);
  }

  it('renders chat messages and the scroll anchor marker', () => {
    renderChatWindow();

    expect(screen.getByText('Test message')).toBeInTheDocument();
    expect(screen.getByTestId('chat-scroll-anchor')).toBeInTheDocument();
  });

  it('submits the composer when the Send button is clicked', async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn();

    renderChatWindow({ onComposerSubmit: handleSubmit });

    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(handleSubmit).toHaveBeenCalledTimes(1);
    const [event] = handleSubmit.mock.calls[0];
    expect(event).toHaveProperty('preventDefault');
    expect(event.target).toBeInstanceOf(HTMLFormElement);
  });

  it('allows reissuing commands via the tooltip action', async () => {
    const user = userEvent.setup();
    const handleReissue = vi.fn();
    const message = createMessage({ id: 'message-2', content: 'Retry me' });

    renderChatWindow({
      messages: [message],
      onReissueCommand: handleReissue,
    });

    await user.click(
      screen.getByRole('button', { name: 'Re-issue command Retry me' }),
    );

    expect(handleReissue).toHaveBeenCalledWith(message);
  });
});
