import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { JsonTreeView } from '../../src/common/JsonTreeView';

describe('JsonTreeView', () => {
  it('renders nested objects with toggle controls', async () => {
    const user = userEvent.setup();

    render(
      <JsonTreeView
        value={{
          agent: {
            id: 'agent-1',
            stats: {
              iterations: 4,
            },
          },
        }}
        collapsedByDefault
        rootLabel="Agent metadata"
      />,
    );

    expect(screen.getByTestId('json-tree-view-root-label')).toHaveTextContent('Agent metadata');

    const agentToggle = screen.getByRole('button', { name: /toggle agent/i });
    await user.click(agentToggle);
    const statsToggle = screen.getByRole('button', { name: /toggle stats/i });
    await user.click(statsToggle);

    expect(screen.getByText(/"id"/)).toBeInTheDocument();
    expect(screen.getByText(/"iterations"/)).toBeInTheDocument();
  });

  it('renders primitive values without controls', () => {
    render(<JsonTreeView value="hello" />);

    expect(screen.getByTestId('json-entry-root')).toHaveTextContent('"hello"');
  });
});
