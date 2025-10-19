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

  it('renders animated collapsible content when expanded', () => {
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

    const content = screen.getByText('Panel content').closest('[data-state]');

    expect(content).toHaveAttribute('data-state', 'open');
    expect(content).toHaveClass('data-[state=open]:animate-accordion-down');
    expect(content).toHaveClass('data-[state=closed]:animate-accordion-up');
    expect(content).toHaveClass('grid');
    expect(content).toHaveClass('transition-all');
    expect(content).toHaveClass('duration-500');
    expect(content).toHaveClass('ease-out');
    expect(content).toHaveClass('data-[state=open]:grid-rows-[1fr]');
    expect(content).toHaveClass('data-[state=closed]:grid-rows-[0fr]');
  });
});
