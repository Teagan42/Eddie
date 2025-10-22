import { render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Theme } from '@radix-ui/themes';

import {
  SESSION_TABLIST_ARIA_LABEL,
  SessionSelector,
  type SessionSelectorProps,
  type SessionSelectorSession,
} from '../../src/chat/SessionSelector';

type Status = SessionSelectorSession['status'];

function createSession(
  partial: Partial<SessionSelectorSession> = {},
): SessionSelectorSession {
  return {
    id: 'session-1',
    title: 'Session 1',
    status: 'active' as Status,
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

    expect(
      screen.getByRole('tablist', { name: SESSION_TABLIST_ARIA_LABEL }),
    ).toBeInTheDocument();

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
        createSession({ id: 'archived', title: 'Archived session', status: 'archived' as Status }),
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

  it('allows session actions to be triggered from a context menu', async () => {
    const user = userEvent.setup();
    const handleRename = vi.fn();
    const handleDelete = vi.fn();

    renderSelector({
      onRenameSession: handleRename,
      onDeleteSession: handleDelete,
    });

    await waitFor(() => user.click(screen.getByRole('button', { name: 'Session options for Session 1' })));
    await user.click(await screen.findByRole('menuitem', { name: 'Rename session' }));

    expect(handleRename).toHaveBeenCalledWith('session-1');

    await user.click(screen.getByRole('button', { name: 'Session options for Session 2' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Archive session' }));

    expect(handleDelete).toHaveBeenCalledWith('session-2');
  });

  it('renders session action menus with native button semantics', () => {
    renderSelector();

    const firstMenuTrigger = screen.getByRole('button', { name: 'Session options for Session 1' });

    expect(firstMenuTrigger.tagName.toLowerCase()).toBe('button');
    expect(firstMenuTrigger).toHaveAttribute('type', 'button');
  });

  it('organizes sessions into status-based tabs', async () => {
    const user = userEvent.setup();

    renderSelector({
      sessions: [
        createSession({ id: 'active-session', title: 'Active session' }),
        createSession({ id: 'archived-session', title: 'Archived session', status: 'archived' as Status }),
      ],
      selectedSessionId: null,
    });

    const categoriesTablist = screen.getByRole('tablist', { name: 'Session categories' });
    const activeCategory = within(categoriesTablist).getByRole('tab', { name: 'Active' });
    const archivedCategory = within(categoriesTablist).getByRole('tab', { name: 'Archived' });

    expect(activeCategory).toHaveAttribute('aria-selected', 'true');
    expect(archivedCategory).toHaveAttribute('aria-selected', 'false');

    const sessionTablist = screen.getByRole('tablist', { name: SESSION_TABLIST_ARIA_LABEL });
    expect(within(sessionTablist).getByRole('tab', { name: 'Active session' })).toBeInTheDocument();
    expect(
      within(sessionTablist).queryByRole('tab', { name: 'Archived session' }),
    ).not.toBeInTheDocument();

    await user.click(archivedCategory);

    expect(activeCategory).toHaveAttribute('aria-selected', 'false');
    expect(archivedCategory).toHaveAttribute('aria-selected', 'true');
    const archivedSessionTablist = screen.getByRole('tablist', { name: SESSION_TABLIST_ARIA_LABEL });
    expect(
      within(archivedSessionTablist).getByRole('tab', { name: 'Archived session' }),
    ).toBeInTheDocument();
    expect(
      within(archivedSessionTablist).queryByRole('tab', { name: 'Active session' }),
    ).not.toBeInTheDocument();
  });

  it('always shows the session list without a collapse toggle', () => {
    renderSelector();

    expect(
      screen.queryByRole('button', { name: /session list/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Session 1' })).toBeVisible();
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
