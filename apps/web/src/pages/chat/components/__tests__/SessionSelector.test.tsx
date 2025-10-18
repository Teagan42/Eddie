import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { SessionSelector, type SessionSelectorProps } from '../SessionSelector';

const baseSessions: SessionSelectorProps['sessions'] = [
  {
    id: 'session-1',
    title: 'Session 1',
    status: 'active',
  },
  {
    id: 'session-2',
    title: 'Session 2',
    status: 'active',
  },
];

class ResizeObserverMock {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
});

describe('SessionSelector', () => {
  it('calls onSelectSession when a session button is activated', async () => {
    const user = userEvent.setup();
    const handleSelect = vi.fn();

    render(
      <SessionSelector
        sessions={baseSessions}
        selectedSessionId="session-1"
        onSelectSession={handleSelect}
        onRenameSession={vi.fn()}
        onDeleteSession={vi.fn()}
        onCreateSession={vi.fn()}
        isCreatePending={false}
      />,
    );

    const selectedButton = screen.getByRole('button', { name: 'Session 1' });
    expect(selectedButton).toHaveAttribute('data-accent-color', 'jade');

    await user.click(screen.getByRole('button', { name: 'Session 2' }));

    expect(handleSelect).toHaveBeenCalledWith('session-2');
  });

  it('marks the selected session for styling cues', () => {
    render(
      <SessionSelector
        sessions={baseSessions}
        selectedSessionId="session-1"
        onSelectSession={vi.fn()}
        onRenameSession={vi.fn()}
        onDeleteSession={vi.fn()}
        onCreateSession={vi.fn()}
        isCreatePending={false}
      />,
    );

    expect(screen.getByRole('button', { name: 'Session 1' })).toHaveAttribute(
      'data-selected',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Session 2' })).not.toHaveAttribute(
      'data-selected',
    );
  });

  it('renders archived status badges when present', () => {
    render(
      <SessionSelector
        sessions={[
          baseSessions[0],
          { id: 'archived', title: 'Archived session', status: 'archived' },
        ]}
        selectedSessionId={null}
        onSelectSession={vi.fn()}
        onRenameSession={vi.fn()}
        onDeleteSession={vi.fn()}
        onCreateSession={vi.fn()}
        isCreatePending={false}
      />,
    );

    expect(screen.getByText('Archived')).toBeInTheDocument();
  });

  it('renders session metrics with accessible labelling', () => {
    render(
      <SessionSelector
        sessions={[
          {
            id: 'session-1',
            title: 'Session 1',
            status: 'active',
            metrics: {
              messageCount: 12,
              agentCount: 3,
              contextBundleCount: 4,
            },
          },
        ] as unknown as SessionSelectorProps['sessions']}
        selectedSessionId={null}
        onSelectSession={vi.fn()}
        onRenameSession={vi.fn()}
        onDeleteSession={vi.fn()}
        onCreateSession={vi.fn()}
        isCreatePending={false}
      />,
    );

    const button = screen.getByRole('button', { name: 'Session 1' });
    const descriptionId = button.getAttribute('aria-describedby');
    expect(descriptionId).toBeTruthy();
    const description = document.getElementById(descriptionId!);
    expect(description).toHaveTextContent('12 messages');
    expect(description).toHaveTextContent('3 agents');
    expect(description).toHaveTextContent('4 bundles');
    expect(description).toHaveTextContent('Session 1 metrics');

    expect(screen.queryByText('12 messages')).not.toBeInTheDocument();
    expect(screen.queryByText('4 bundles')).not.toBeInTheDocument();

    const messageBadge = screen.getByLabelText('12 messages');
    expect(messageBadge).toHaveTextContent('12');
    expect(messageBadge.textContent).not.toContain('messages');
    expect(messageBadge.querySelector('svg')).not.toBeNull();

    const bundleBadge = screen.getByLabelText('4 bundles');
    expect(bundleBadge).toHaveTextContent('4');
    expect(bundleBadge.textContent).not.toContain('bundles');
    expect(bundleBadge.querySelector('svg')).not.toBeNull();
  });

  it('renders an edit action that renames the session', async () => {
    const user = userEvent.setup();
    const handleRename = vi.fn();

    render(
      <SessionSelector
        sessions={baseSessions}
        selectedSessionId="session-1"
        onSelectSession={vi.fn()}
        onRenameSession={handleRename}
        onDeleteSession={vi.fn()}
        onCreateSession={vi.fn()}
        isCreatePending={false}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Edit Session 1' }));

    expect(handleRename).toHaveBeenCalledWith('session-1');
  });

  it('aligns the delete action with the session controls', () => {
    render(
      <SessionSelector
        sessions={baseSessions}
        selectedSessionId="session-1"
        onSelectSession={vi.fn()}
        onRenameSession={vi.fn()}
        onDeleteSession={vi.fn()}
        onCreateSession={vi.fn()}
        isCreatePending={false}
      />,
    );

    expect(screen.getByLabelText('Delete Session 1')).toHaveStyle('align-self: stretch');
  });

  it('renders a compact edit control without visible text while remaining accessible', () => {
    render(
      <SessionSelector
        sessions={baseSessions}
        selectedSessionId="session-1"
        onSelectSession={vi.fn()}
        onRenameSession={vi.fn()}
        onDeleteSession={vi.fn()}
        onCreateSession={vi.fn()}
        isCreatePending={false}
      />,
    );

    const editControl = screen.getByRole('button', { name: 'Edit Session 1' });
    expect(editControl).toHaveAttribute('title', 'Edit Session 1');
    expect(editControl).toHaveTextContent(/^\s*$/);
  });
});
