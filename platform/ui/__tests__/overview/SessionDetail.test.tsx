import { waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SessionDetail } from '../../src/overview/SessionDetail';
import { renderWithUIProviders } from '../test-utils';

type SessionFixture = {
  id: string;
  title: string;
};

type MessageFixture = {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  createdAt: string;
  event?: string | null;
  name?: string | null;
  metadata?: {
    agent?: {
      id?: string | null;
      name?: string | null;
    } | null;
  } | null;
};

describe('SessionDetail', () => {
  function createSession(partial?: Partial<SessionFixture>): SessionFixture {
    return {
      id: 'session-1',
      title: 'Session 1',
      ...partial,
    } satisfies SessionFixture;
  }

  function createMessage(partial?: Partial<MessageFixture>): MessageFixture {
    return {
      id: 'message-1',
      role: 'assistant',
      content: 'Hello world',
      createdAt: new Date().toISOString(),
      ...partial,
    } satisfies MessageFixture;
  }

  it('renders completed messages as individual cards with agent headings', () => {
    const session = createSession();
    const messages = [
      createMessage({
        id: 'message-1',
        role: 'assistant',
        name: 'Orchestrator',
        content: 'Working on it…',
        event: 'delta',
      }),
      createMessage({
        id: 'message-1',
        role: 'assistant',
        name: 'Orchestrator',
        content: 'Task complete',
        event: 'end',
      }),
      createMessage({
        id: 'message-2',
        role: 'assistant',
        name: 'Delegate',
        content: 'Providing support',
        event: 'end',
      }),
    ];

    const { queryByText, getAllByTestId } = renderWithUIProviders(
      <SessionDetail session={session} isLoading={false} messages={messages} />,
    );

    expect(queryByText('Working on it…')).not.toBeInTheDocument();

    const cards = getAllByTestId('message-card');
    expect(cards).toHaveLength(2);
    expect(within(cards[0]!).getByText(/Orchestrator/i)).toBeInTheDocument();
    expect(within(cards[0]!).getByText('Task complete')).toBeInTheDocument();
    expect(within(cards[1]!).getByText(/Delegate/i)).toBeInTheDocument();
    expect(within(cards[1]!).getByText('Providing support')).toBeInTheDocument();
  });

  it('uses agent metadata for message headings when available', () => {
    const session = createSession();
    const messages = [
      createMessage({
        id: 'message-1',
        role: 'assistant',
        content: 'Drafting response',
        event: 'delta',
        metadata: { agent: { id: 'manager', name: 'Manager' } },
      }),
      createMessage({
        id: 'message-1',
        role: 'assistant',
        content: 'Final response',
        event: 'end',
      }),
      createMessage({
        id: 'message-2',
        role: 'assistant',
        content: 'Delegate reply',
        event: 'end',
        metadata: { agent: { id: 'delegate', name: 'Delegate' } },
      }),
    ];

    const { getAllByTestId } = renderWithUIProviders(
      <SessionDetail session={session} isLoading={false} messages={messages} />,
    );

    const cards = getAllByTestId('message-card');
    expect(cards).toHaveLength(2);
    expect(within(cards[0]!).getByText(/^Manager$/i)).toBeInTheDocument();
    expect(within(cards[1]!).getByText(/^Delegate$/i)).toBeInTheDocument();
  });

  it('scrolls the latest message into view when new messages arrive', async () => {
    const original = HTMLElement.prototype.scrollIntoView;
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    const session = createSession();
    const initialMessages = [createMessage({ id: 'message-1' })];
    const { rerender } = renderWithUIProviders(
      <SessionDetail session={session} isLoading={false} messages={initialMessages} />,
    );

    scrollIntoView.mockClear();

    rerender(
      <SessionDetail
        session={session}
        isLoading={false}
        messages={[...initialMessages, createMessage({ id: 'message-2', content: 'Another' })]}
      />,
    );

    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalled();
    });

    HTMLElement.prototype.scrollIntoView = original;
  });

  it('keeps the latest message visible while it streams updates', async () => {
    const original = HTMLElement.prototype.scrollIntoView;
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    const session = createSession();
    const initialMessages = [createMessage({ id: 'message-1', content: 'Partial' })];
    const { rerender } = renderWithUIProviders(
      <SessionDetail session={session} isLoading={false} messages={initialMessages} />,
    );

    scrollIntoView.mockClear();

    rerender(
      <SessionDetail
        session={session}
        isLoading={false}
        messages={[createMessage({ id: 'message-1', content: 'Partial update complete' })]}
      />,
    );

    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalled();
    });

    HTMLElement.prototype.scrollIntoView = original;
  });
});
