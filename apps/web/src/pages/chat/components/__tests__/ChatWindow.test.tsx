import { createRef } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { ChatMessageDto } from '@eddie/api-client';

import { TooltipProvider } from '@radix-ui/react-tooltip';

import { ChatWindow, type ChatWindowProps } from '../ChatWindow';

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

beforeAll(() => {
  class MockResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  // @ts-expect-error jsdom does not provide ResizeObserver
  global.ResizeObserver = MockResizeObserver;
});

describe('ChatWindow', () => {
  function renderChatWindow(props?: Partial<ChatWindowProps>) {
    const defaultProps: ChatWindowProps = {
      messages: [createMessage()],
      onReissueCommand: vi.fn(),
      scrollAnchorRef: createRef<HTMLDivElement>(),
      agentActivityState: 'thinking',
      composerRole: 'user',
      onComposerRoleChange: vi.fn(),
      composerRoleDisabled: false,
      composerValue: 'Hello world',
      onComposerValueChange: vi.fn(),
      composerDisabled: false,
      composerSubmitDisabled: false,
      composerPlaceholder: 'Send a message to the orchestrator',
      onComposerSubmit: vi.fn(),
    };

    return render(
      <TooltipProvider>
        <ChatWindow {...defaultProps} {...props} />
      </TooltipProvider>,
    );
  }

  it('renders rich chat messages with metadata and reissue action', async () => {
    const user = userEvent.setup();
    const handleReissue = vi.fn();
    const message = createMessage({
      id: 'message-2',
      content: 'Retry me',
      role: 'user',
    });

    renderChatWindow({
      messages: [message],
      onReissueCommand: handleReissue,
    });

    const logRegion = screen.getByRole('log');
    expect(within(logRegion).getByText('User')).toBeInTheDocument();
    expect(within(logRegion).getByText('Retry me')).toBeInTheDocument();
    expect(screen.getByTestId('chat-scroll-anchor')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Re-issue command' }));

    expect(handleReissue).toHaveBeenCalledWith(message);
  });

  it('renders the agent activity indicator and segmented role control', async () => {
    const user = userEvent.setup();
    const handleRoleChange = vi.fn();

    renderChatWindow({
      agentActivityState: 'sending',
      onComposerRoleChange: handleRoleChange,
    });

    expect(
      screen.getByRole('status', { name: 'Dispatching message…' }),
    ).toBeInTheDocument();
    const askOption = screen.getByRole('radio', { name: 'Ask' });
    const runOption = screen.getByRole('radio', { name: 'Run' });
    expect(askOption).toBeChecked();

    await user.click(runOption);

    expect(handleRoleChange).toHaveBeenCalledWith('system');
  });

  it('forwards composer interactions to the provided handlers', async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn();
    const handleValueChange = vi.fn();

    renderChatWindow({
      onComposerSubmit: handleSubmit,
      onComposerValueChange: handleValueChange,
      composerPlaceholder: 'Send a message to the orchestrator',
    });

    const textarea = screen.getByPlaceholderText('Send a message to the orchestrator');
    await user.type(textarea, 'New command');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(handleValueChange).toHaveBeenCalled();
    expect(handleSubmit).toHaveBeenCalledTimes(1);
  });
});
