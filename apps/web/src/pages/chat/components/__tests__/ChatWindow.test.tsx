import { createRef } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@radix-ui/react-tooltip';

import {
  ChatWindow,
  type ChatWindowProps,
  type MessageListItem,
} from '@eddie/ui';

type TestMessage = MessageListItem & {
  metadata?: {
    agent?: {
      name?: string | null;
      parentName?: string | null;
    } | null;
    tool?: {
      id?: string | null;
      name?: string | null;
      status?: string | null;
    } | null;
  } | null;
  reasoning?: {
    segments?: Array<{
      text?: string;
      timestamp?: string;
      agentId?: string | null;
    }>;
    status?: "streaming" | "completed";
  } | null;
};

function createMessage(partial?: Partial<TestMessage>): TestMessage {
  return {
    id: 'message-1',
    sessionId: 'session-1',
    role: 'user',
    content: 'Test message',
    createdAt: new Date().toISOString(),
    ...partial,
  } as TestMessage;
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
      onInspectToolInvocation: vi.fn(),
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

  it('shows agent provenance for tool messages', () => {
    const messages: TestMessage[] = [
      createMessage({
        id: 'message-user',
        role: 'user',
        content: 'How is progress?'
      }),
      createMessage({
        id: 'message-tool',
        role: 'tool',
        content: 'Gathering results',
        metadata: {
          agent: {
            name: 'Researcher',
            parentName: 'Orchestrator'
          }
        }
      }),
    ];

    renderChatWindow({ messages });

    const logRegion = screen.getByRole('log');
    expect(within(logRegion).getByText('Researcher')).toBeInTheDocument();
    expect(within(logRegion).getByText('Orchestrator')).toBeInTheDocument();
    expect(within(logRegion).getByText('Tool invocation')).toBeInTheDocument();
    expect(within(logRegion).getByText('Unknown')).toBeInTheDocument();
    expect(screen.queryByText('Gathering results')).not.toBeInTheDocument();
  });

  it('summarizes tool messages without rendering raw payloads', () => {
    const toolMessage = createMessage({
      id: 'message-tool',
      role: 'tool',
      content: '{"result":"hidden"}',
      name: 'web_search',
      toolCallId: 'tool-1',
      metadata: {
        agent: {
          name: 'Researcher',
          parentName: 'Orchestrator',
        },
        tool: {
          id: 'tool-1',
          name: 'Browser',
          status: 'completed',
        },
      },
    });

    renderChatWindow({ messages: [toolMessage] });

    const logRegion = screen.getByRole('log');
    expect(within(logRegion).getByText('Researcher')).toBeInTheDocument();
    expect(within(logRegion).getByText('Orchestrator')).toBeInTheDocument();
    expect(within(logRegion).getByText('Browser')).toBeInTheDocument();
    expect(within(logRegion).getByText('Completed')).toBeInTheDocument();
    expect(screen.queryByText('hidden')).not.toBeInTheDocument();
  });

  it('renders reasoning transcript with agent metadata', () => {
    const timestamp = '2024-01-01T12:34:00.000Z';
    const expectedTime = new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    const assistantMessage = createMessage({
      id: 'assistant-1',
      role: 'assistant',
      content: 'final answer',
      metadata: {
        agent: {
          name: 'Scout',
          parentName: 'Lead Researcher',
        },
      },
      reasoning: {
        status: 'streaming',
        segments: [
          {
            text: 'Exploring options',
            timestamp,
            agentId: 'agent-99',
          },
        ],
      },
    });

    renderChatWindow({ messages: [assistantMessage] });

    const reasoning = screen.getByTestId('chat-message-reasoning');
    const segment = within(reasoning).getByTestId('chat-message-reasoning-segment');
    expect(within(segment).getByText('Agent Scout')).toBeVisible();
    expect(
      within(segment).getByText(/Reports to Lead Researcher/)
    ).toBeVisible();
    expect(within(segment).getByText('Exploring options')).toBeVisible();
    expect(within(segment).getByText(expectedTime)).toBeVisible();
  });

  it('opens the tool drawer when clicking a tool message', async () => {
    const user = userEvent.setup();
    const handleInspectTool = vi.fn();
    const toolMessage = createMessage({
      id: 'message-tool',
      role: 'tool',
      content: 'irrelevant',
      name: 'bash',
      toolCallId: 'call-123',
      metadata: {
        tool: {
          id: 'call-123',
          name: 'Shell',
          status: 'running',
        },
      },
    });

    renderChatWindow({
      messages: [toolMessage],
      onInspectToolInvocation: handleInspectTool,
    });

    const toolMessageCard = screen.getByRole('button', {
      name: /shell tool invocation/i,
    });

    await user.click(toolMessageCard);

    expect(handleInspectTool).toHaveBeenCalledWith('call-123');
  });

  it('falls back to metadata tool id when toolCallId is missing', async () => {
    const user = userEvent.setup();
    const handleInspectTool = vi.fn();
    const toolMessage = createMessage({
      id: 'tool-with-metadata-only',
      role: 'tool',
      content: 'payload',
      metadata: {
        tool: {
          id: 'meta-tool-id',
          name: 'Meta tool',
          status: 'completed',
        },
      },
    });

    renderChatWindow({
      messages: [toolMessage],
      onInspectToolInvocation: handleInspectTool,
    });

    const toolMessageCard = screen.getByRole('button', {
      name: /meta tool tool invocation/i,
    });

    await user.click(toolMessageCard);

    expect(handleInspectTool).toHaveBeenCalledWith('meta-tool-id');
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
