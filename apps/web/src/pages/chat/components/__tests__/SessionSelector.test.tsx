import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Theme } from '@radix-ui/themes';

import {
  SessionSelector,
  type SessionSelectorProps,
  type SessionSelectorSession,
} from '../SessionSelector';

function createSession(
  partial: Partial<SessionSelectorSession> = {},
): SessionSelectorSession {
  return {
    id: 'session-1',
    title: 'Session 1',
    status: 'active',
    ...partial,
  };
}

const baseSessions: SessionSelectorProps['sessions'] = [
  createSession(),
  createSession({ id: 'session-2', title: 'Session 2' }),
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
  function renderSelector(overrideProps: Partial<SessionSelectorProps> = {}): void {
    const props: SessionSelectorProps = {
      sessions: baseSessions,
      selectedSessionId: 'session-1',
      onSelectSession: vi.fn(),
      onRenameSession: vi.fn(),
      onDeleteSession: vi.fn(),
      onCreateSession: vi.fn(),
      isCreatePending: false,
      ...overrideProps,
    };

    render(
      <Theme>
        <SessionSelector {...props} />
      </Theme>,
    );
  }

  it('activates sessions via tab interactions', async () => {
    const user = userEvent.setup();
    const handleSelect = vi.fn();

    renderSelector({ onSelectSession: handleSelect });

    expect(screen.getByRole('tablist')).toBeInTheDocument();

    const selectedTab = screen.getByRole('tab', { name: 'Session 1' });
    expect(selectedTab).toHaveAttribute('aria-selected', 'true');

    await user.click(screen.getByRole('tab', { name: 'Session 2' }));

    expect(handleSelect).toHaveBeenCalledWith('session-2');
  });

  it('marks the selected session for styling cues', () => {
    renderSelector();

    expect(screen.getByRole('tab', { name: 'Session 1' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Session 2' })).toHaveAttribute('aria-selected', 'false');
  });

  it('renders archived status badges when present', () => {
    renderSelector({
      sessions: [
        baseSessions[0],
        createSession({ id: 'archived', title: 'Archived session', status: 'archived' }),
      ],
      selectedSessionId: null,
    });

    expect(screen.getByText('Archived')).toBeInTheDocument();
  });

  it('renders session metrics with accessible labelling', () => {
    renderSelector({
      sessions: [
        createSession({
          metrics: {
            messageCount: 12,
            agentCount: 3,
            contextBundleCount: 4,
          },
        }),
      ],
      selectedSessionId: null,
    });

    const tab = screen.getByRole('tab', { name: 'Session 1' });
    const descriptionId = tab.getAttribute('aria-describedby');
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

  it('renders a tab panel for the selected session with contextual details', () => {
    renderSelector({
      sessions: [
        createSession({
          metrics: {
            messageCount: 8,
            agentCount: 2,
            contextBundleCount: 1,
          },
        }),
      ],
    });

    const selectedTab = screen.getByRole('tab', { name: 'Session 1' });
    const tabPanel = screen.getByRole('tabpanel');

    expect(tabPanel).toHaveAttribute('aria-labelledby', selectedTab.getAttribute('id'));
    expect(tabPanel).toHaveTextContent('Session 1');
    expect(tabPanel).toHaveTextContent('8 messages');
    expect(tabPanel).toHaveTextContent('2 agents');
    expect(tabPanel).toHaveTextContent('1 bundle');
  });

  it('allows session actions to be triggered directly from the tab panel', async () => {
    const user = userEvent.setup();
    const handleRename = vi.fn();
    const handleDelete = vi.fn();

    renderSelector({
      onRenameSession: handleRename,
      onDeleteSession: handleDelete,
    });

    await user.click(screen.getByRole('button', { name: 'Rename session Session 1' }));

    expect(handleRename).toHaveBeenCalledWith('session-1');

    await user.click(screen.getByRole('button', { name: 'Archive session Session 1' }));

    expect(handleDelete).toHaveBeenCalledWith('session-1');
  });

  it('can be collapsed to hide the session list when not needed', async () => {
    const user = userEvent.setup();

    renderSelector();

    const collapseButton = screen.getByRole('button', {
      name: /Collapse session list \(\d+ sessions\)/,
    });
    expect(collapseButton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('tab', { name: 'Session 1' })).toBeInTheDocument();

    await user.click(collapseButton);

    expect(collapseButton).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('tab', { name: 'Session 1' })).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', {
        name: /Expand session list \(\d+ sessions\)/,
      }),
    );

    expect(screen.getByRole('tab', { name: 'Session 1' })).toBeInTheDocument();
  });

  it('renders an animated indicator for the active tab', () => {
    renderSelector();

    const indicator = screen.getByTestId('session-tab-indicator');

    expect(indicator).toHaveAttribute('data-animated', 'true');
    expect(indicator.className).toContain('transition-transform');
  });

  it('animates indicator transitions for movement and size', () => {
    renderSelector();

    const indicator = screen.getByTestId('session-tab-indicator');

    expect(indicator.style.transition).toContain('transform');
    expect(indicator.style.transition).toContain('width');
    expect(indicator.style.transition).toContain('height');
  });
});
