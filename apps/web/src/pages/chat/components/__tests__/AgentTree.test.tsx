import { render, screen } from '@testing-library/react';

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
});
