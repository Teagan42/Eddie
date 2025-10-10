import { render, screen, within } from '@testing-library/react';

import { ToolTree } from '../ToolTree';

describe('ToolTree', () => {
  it('renders an empty state when no nodes exist', () => {
    render(<ToolTree nodes={[]} />);

    expect(screen.getByText(/no tool calls/i)).toBeInTheDocument();
  });

  it('renders nested tool nodes with metadata summaries', () => {
    render(
      <ToolTree
        nodes={[
          {
            id: 'root',
            name: 'shell',
            status: 'completed',
            metadata: {
              command: 'ls',
              createdAt: '2024-01-01T00:00:00.000Z',
              arguments: '--all',
            },
            children: [
              {
                id: 'child',
                name: 'write',
                status: 'completed',
                metadata: {
                  preview: 'wrote file',
                  createdAt: '2024-01-01T00:10:00.000Z',
                  args: { path: 'README.md' },
                },
                children: [],
              },
            ],
          },
        ]}
      />,
    );

    const rootNode = screen.getByText('shell').closest('li');
    expect(rootNode).not.toBeNull();
    const { getAllByText, getByText } = within(rootNode!);
    expect(getAllByText(/tool/i)[0]).toBeInTheDocument();
    expect(getAllByText(/completed/i)[0]).toBeInTheDocument();
    expect(getByText('ls')).toBeInTheDocument();
    expect(getAllByText(/args:/i)[0]).toHaveTextContent('Args: --all');
    expect(within(rootNode!).getByText('write')).toBeInTheDocument();
  });
});
