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
  });
});
