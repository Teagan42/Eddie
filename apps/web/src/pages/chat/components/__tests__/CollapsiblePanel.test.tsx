import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TooltipProvider } from '@radix-ui/react-tooltip';
import { vi } from 'vitest';

import { CollapsiblePanel } from '../CollapsiblePanel';

describe('CollapsiblePanel', () => {
  it('calls onToggle when collapse button is pressed', async () => {
    const user = userEvent.setup();
    const handleToggle = vi.fn();

    render(
      <TooltipProvider>
        <CollapsiblePanel
          id="panel-id"
          title="Panel Title"
          description="Helpful description"
          collapsed={false}
          onToggle={handleToggle}
        >
          Panel content
        </CollapsiblePanel>
      </TooltipProvider>,
    );

    await user.click(screen.getByRole('button', { name: /collapse panel/i }));

    expect(handleToggle).toHaveBeenCalledWith('panel-id', true);
  });

  it('wraps expanded content in a motion region for transitions', () => {
    render(
      <TooltipProvider>
        <CollapsiblePanel
          id="panel-id"
          title="Panel Title"
          description="Helpful description"
          collapsed={false}
          onToggle={vi.fn()}
        >
          Panel content
        </CollapsiblePanel>
      </TooltipProvider>,
    );

    const animatedRegion = screen.getByTestId('collapsible-panel-motion');

    expect(animatedRegion).toHaveAttribute('data-motion', 'collapsible-panel-content');
    expect(animatedRegion).toHaveTextContent('Panel content');
  });
});
