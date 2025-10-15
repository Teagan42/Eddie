import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AgentTree } from '../AgentTree';

describe('AgentTree', () => {
  it('renders a placeholder when there are no agents', () => {
    render(<AgentTree nodes={[]} />);

    expect(screen.getByText(/has not spawned any agents/i)).toBeInTheDocument();
  });

  it('renders agent metadata and nested children', () => {
    render(
      <AgentTree
        nodes={[
          {
            id: 'parent',
            name: 'orchestrator',
            provider: 'openai',
            model: 'gpt-4o',
            depth: 0,
            metadata: { messageCount: 3 },
            children: [
              {
                id: 'child',
                name: 'scribe',
                provider: 'anthropic',
                model: 'claude-3.5',
                depth: 1,
                metadata: { messageCount: 1 },
                children: [],
              },
            ],
          },
        ]}
      />,
    );

    expect(screen.getByText('orchestrator')).toBeInTheDocument();
    expect(screen.getByText('openai')).toBeInTheDocument();
    expect(screen.getByText('gpt-4o')).toBeInTheDocument();
    expect(screen.getByText(/messages observed: 3/i)).toBeInTheDocument();
    expect(screen.getByText('scribe')).toBeInTheDocument();
  });

  it('toggles selection highlights across nested agent lineage', async () => {
    const user = userEvent.setup();

    render(
      <AgentTree
        nodes={[
          {
            id: 'root',
            name: 'orchestrator',
            provider: 'openai',
            model: 'gpt-4o',
            depth: 0,
            metadata: { messageCount: 3 },
            children: [
              {
                id: 'child',
                name: 'scribe',
                provider: 'anthropic',
                model: 'claude-3.5',
                depth: 1,
                metadata: { messageCount: 1 },
                children: [
                  {
                    id: 'grandchild',
                    name: 'analyst',
                    provider: 'openai',
                    model: 'gpt-4o-mini',
                    depth: 2,
                    metadata: { messageCount: 2 },
                    children: [],
                  },
                ],
              },
            ],
          },
        ] as any}
      />,
    );

    const rootButton = screen.getByRole('button', { name: /select orchestrator agent/i });
    const childButton = screen.getByRole('button', { name: /select scribe agent/i });
    const grandchildButton = screen.getByRole('button', { name: /select analyst agent/i });

    const rootItem = rootButton.closest('li');
    const childItem = childButton.closest('li');
    const grandchildItem = grandchildButton.closest('li');

    expect(rootItem).not.toHaveClass('ring-2', { exact: false });
    expect(childItem).not.toHaveClass('ring-2', { exact: false });
    expect(grandchildItem).not.toHaveClass('ring-2', { exact: false });

    await user.click(childButton);

    expect(childItem).toHaveClass('ring-2 ring-offset-2 ring-accent');
    expect(rootItem).toHaveClass('ring-2 ring-offset-2 ring-accent');
    expect(grandchildItem).toHaveClass('ring-2 ring-offset-2 ring-accent');

    await user.click(childButton);

    expect(rootItem).not.toHaveClass('ring-2', { exact: false });
    expect(childItem).not.toHaveClass('ring-2', { exact: false });
    expect(grandchildItem).not.toHaveClass('ring-2', { exact: false });

    await user.click(grandchildButton);

    expect(grandchildItem).toHaveClass('ring-2 ring-offset-2 ring-accent');
    expect(childItem).toHaveClass('ring-2 ring-offset-2 ring-accent');
    expect(rootItem).toHaveClass('ring-2 ring-offset-2 ring-accent');

    await user.click(grandchildButton);

    expect(rootItem).not.toHaveClass('ring-2', { exact: false });
    expect(childItem).not.toHaveClass('ring-2', { exact: false });
    expect(grandchildItem).not.toHaveClass('ring-2', { exact: false });
  });

  it('highlights descendants when selecting an ancestor agent', async () => {
    const user = userEvent.setup();

    render(
      <AgentTree
        nodes={[
          {
            id: 'root',
            name: 'orchestrator',
            provider: 'openai',
            model: 'gpt-4o',
            depth: 0,
            metadata: { messageCount: 3 },
            children: [
              {
                id: 'child',
                name: 'scribe',
                provider: 'anthropic',
                model: 'claude-3.5',
                depth: 1,
                metadata: { messageCount: 1 },
                children: [
                  {
                    id: 'grandchild',
                    name: 'analyst',
                    provider: 'openai',
                    model: 'gpt-4o-mini',
                    depth: 2,
                    metadata: { messageCount: 2 },
                    children: [],
                  },
                ],
              },
            ],
          },
        ] as any}
      />,
    );

    const rootButton = screen.getByRole('button', { name: /select orchestrator agent/i });
    const childButton = screen.getByRole('button', { name: /select scribe agent/i });
    const grandchildButton = screen.getByRole('button', { name: /select analyst agent/i });

    const rootItem = rootButton.closest('li');
    const childItem = childButton.closest('li');
    const grandchildItem = grandchildButton.closest('li');

    await user.click(rootButton);

    expect(rootItem).toHaveClass('ring-2 ring-offset-2 ring-accent');
    expect(childItem).toHaveClass('ring-2 ring-offset-2 ring-accent');
    expect(grandchildItem).toHaveClass('ring-2 ring-offset-2 ring-accent');

    await user.click(rootButton);

    expect(rootItem).not.toHaveClass('ring-2', { exact: false });
    expect(childItem).not.toHaveClass('ring-2', { exact: false });
    expect(grandchildItem).not.toHaveClass('ring-2', { exact: false });
  });
});
