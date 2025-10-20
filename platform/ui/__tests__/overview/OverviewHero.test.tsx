import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { OverviewHero } from '../../src/overview/OverviewHero';
import { renderWithUIProviders } from '../test-utils';

describe('OverviewHero', () => {
  const stats = [
    {
      label: 'Active Sessions',
      value: 4,
      hint: 'Live control plane sessions',
      icon: ({ className }: { className?: string }) => (
        <span data-testid="stat-icon" className={className} />
      ),
    },
  ];

  it('displays the provided API status and stats', () => {
    renderWithUIProviders(
      <OverviewHero
        apiKey="demo"
        apiUrl="https://api.example.com"
        theme="light"
        onSelectTheme={vi.fn()}
        onRemoveApiKey={vi.fn()}
        stats={stats}
      />,
    );

    expect(screen.getByText(/API key ready/i)).toBeInTheDocument();
    expect(screen.getByText('https://api.example.com')).toBeInTheDocument();
    expect(screen.getByText('Active Sessions')).toBeInTheDocument();
    expect(screen.getByTestId('stat-icon')).toBeInTheDocument();
  });

  it('invokes onRemoveApiKey when remove button is clicked', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();

    renderWithUIProviders(
      <OverviewHero
        apiKey="demo"
        apiUrl="https://api.example.com"
        theme="light"
        onSelectTheme={vi.fn()}
        onRemoveApiKey={onRemove}
        stats={stats}
      />,
    );

    await user.click(screen.getByRole('button', { name: /remove key/i }));

    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('renders theme options and emits selection changes', async () => {
    const user = userEvent.setup();
    const onSelectTheme = vi.fn();

    renderWithUIProviders(
      <OverviewHero
        apiKey="demo"
        apiUrl="https://api.example.com"
        theme="light"
        onSelectTheme={onSelectTheme}
        onRemoveApiKey={vi.fn()}
        stats={stats}
        availableThemes={['light', 'dark', 'midnight']}
      />,
    );

    await user.click(screen.getByRole('combobox', { name: /theme/i }));
    const darkOption = await screen.findByRole('option', { name: /dark/i });
    await user.click(darkOption);

    expect(onSelectTheme).toHaveBeenCalledWith('dark');
  });

  it('renders without throwing when wrapped in shared UI providers', () => {
    expect(() =>
      renderWithUIProviders(
        <OverviewHero
          apiKey="demo"
          apiUrl="https://api.example.com"
          theme="light"
          onSelectTheme={vi.fn()}
          onRemoveApiKey={vi.fn()}
          stats={stats}
          availableThemes={['light', 'dark']}
        />,
      ),
    ).not.toThrow();
  });
});
