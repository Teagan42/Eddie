import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ToolTree, TOOL_DIALOG_CTA_ICON_TEST_ID } from '../ToolTree';
import { summarizeObject } from '../../chat-utils';

describe('ToolTree', () => {
  it('renders an empty state when no nodes exist', () => {
    render(<ToolTree nodes={[]} />);

    expect(screen.getByText(/no tool calls/i)).toBeInTheDocument();
  });

  it('renders nested tool nodes with metadata summaries', async () => {
    const user = userEvent.setup();

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

    await user.click(
      within(rootNode!).getByRole('button', {
        name: 'Toggle shell children',
      }),
    );

    expect(within(rootNode!).queryByText('write')).not.toBeInTheDocument();
  });

  it('renders JSON arguments using the explorer for nested data', async () => {
    const user = userEvent.setup();

    render(
      <ToolTree
        nodes={[
          {
            id: 'root',
            name: 'orchestrate',
            status: 'completed',
            metadata: {
              command: 'compose',
              createdAt: '2024-01-01T00:00:00.000Z',
              arguments: {
                request: {
                  body: {
                    subject: 'Plan mission',
                  },
                },
              },
            },
            children: [],
          },
        ]}
      />,
    );

    const rootNode = screen.getByText('orchestrate').closest('li');
    expect(rootNode).not.toBeNull();

    expect(within(rootNode!).getByTestId('json-tree-view')).toBeInTheDocument();
    expect(
      within(rootNode!).queryByTestId('json-entry-request.body'),
    ).not.toBeInTheDocument();

    await user.click(
      within(rootNode!).getByRole('button', { name: 'Toggle request' }),
    );

    const expandedRequestEntry = within(rootNode!)
      .getAllByTestId('json-entry-request')
      .find((node) => node.tagName === 'LI');
    expect(expandedRequestEntry).toHaveAttribute('data-state', 'expanded');
    const bodyEntry = within(rootNode!).getByTestId('json-entry-request.body');
    expect(bodyEntry).toHaveTextContent('"body"');
    expect(bodyEntry).toHaveTextContent('Object');

    await user.click(
      within(rootNode!).getByRole('button', { name: 'Toggle body' }),
    );

    const subjectEntry = within(rootNode!).getByTestId(
      'json-entry-request.body.subject',
    );
    expect(subjectEntry).toHaveTextContent('"subject"');
    expect(subjectEntry).toHaveTextContent('"Plan mission"');
  });

  it('allows collapsing and expanding child tool nodes', async () => {
    const user = userEvent.setup();

    render(
      <ToolTree
        nodes={[
          {
            id: 'root',
            name: 'shell',
            status: 'completed',
            metadata: { createdAt: '2024-01-01T00:00:00.000Z' },
            children: [
              {
                id: 'child',
                name: 'write',
                status: 'completed',
                metadata: { createdAt: '2024-01-01T00:05:00.000Z' },
                children: [],
              },
            ],
          },
        ]}
      />,
    );

    const toggleButton = screen.getByRole('button', {
      name: 'Toggle shell children',
    });

    expect(screen.getByText('write')).toBeInTheDocument();

    await user.click(toggleButton);

    expect(screen.queryByText('write')).not.toBeInTheDocument();

    await user.click(toggleButton);

    expect(screen.getByText('write')).toBeInTheDocument();
  });

  it('auto expands the latest tool call when new nodes arrive', () => {
    const initialNodes = [
      {
        id: 'root',
        name: 'shell',
        status: 'completed' as const,
        metadata: { createdAt: '2024-01-01T00:00:00.000Z' },
        children: [],
      },
    ];
    const { rerender } = render(<ToolTree nodes={initialNodes as any} />);

    expect(screen.queryByText('write')).not.toBeInTheDocument();

    const nextNodes = [
      {
        id: 'root',
        name: 'shell',
        status: 'completed' as const,
        metadata: { createdAt: '2024-01-01T00:00:00.000Z' },
        children: [
          {
            id: 'child',
            name: 'write',
            status: 'completed' as const,
            metadata: { createdAt: '2024-01-01T00:05:00.000Z' },
            children: [],
          },
        ],
      },
    ];

    rerender(<ToolTree nodes={nextNodes as any} />);

    expect(screen.getByText('write')).toBeInTheDocument();

    const toggleButton = screen.getByRole('button', {
      name: 'Toggle shell children',
    });
    expect(toggleButton).toHaveAttribute('aria-expanded', 'true');
  });

  it('auto expands agent sections that contain the latest tool call', async () => {
    const nodes = [
      {
        id: 'manager-tool',
        name: 'fetch_documents',
        status: 'completed' as const,
        metadata: {
          createdAt: '2024-02-01T00:05:00.000Z',
          agentId: 'manager',
        },
        children: [],
      },
    ];
    const agentHierarchy = [
      {
        id: 'session-1',
        name: 'Orchestrator session',
        provider: 'orchestrator',
        model: 'delegator',
        depth: 0,
        metadata: { messageCount: 2 },
        children: [
          {
            id: 'manager',
            name: 'Manager',
            provider: 'openai',
            model: 'gpt-4o-mini',
            depth: 1,
            metadata: { messageCount: 3 },
            children: [
              {
                id: 'writer',
                name: 'Writer',
                provider: 'anthropic',
                model: 'claude-3-5-sonnet',
                depth: 2,
                metadata: { messageCount: 1 },
                children: [],
              },
            ],
          },
        ],
      },
    ];

    const { rerender } = render(
      <ToolTree nodes={nodes as any} agentHierarchy={agentHierarchy as any} />,
    );

    expect(screen.queryByText('Writer')).not.toBeInTheDocument();

    nodes.push({
      id: 'writer-tool',
      name: 'write_report',
      status: 'running' as const,
      metadata: {
        createdAt: '2024-02-01T00:10:00.000Z',
        agentId: 'writer',
      },
      children: [],
    });

    rerender(<ToolTree nodes={nodes as any} agentHierarchy={agentHierarchy as any} />);

    const writerLabel = await screen.findByText('Writer');
    expect(writerLabel).toBeInTheDocument();
    expect(screen.getByText('write_report')).toBeInTheDocument();

    const writerToggle = await screen.findByRole('button', {
      name: 'Toggle Writer tools',
    });
    expect(writerToggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('groups tool invocations beneath collapsable agent levels', async () => {
    const user = userEvent.setup();

    const props = {
      nodes: [
        {
          id: 'tool-root',
          name: 'spawn_subagent',
          status: 'completed',
          metadata: {
            createdAt: '2024-02-01T00:00:00.000Z',
            arguments: '--verbose',
            agentId: 'session-1',
          },
          children: [],
        },
        {
          id: 'tool-manager',
          name: 'fetch_documents',
          status: 'completed',
          metadata: {
            createdAt: '2024-02-01T00:05:00.000Z',
            args: { source: 'wiki' },
            agentId: 'manager',
          },
          children: [],
        },
        {
          id: 'tool-writer',
          name: 'write_report',
          status: 'pending',
          metadata: {
            createdAt: '2024-02-01T00:10:00.000Z',
            args: { topic: 'status update' },
            agentId: 'writer',
          },
          children: [],
        },
      ],
      agentHierarchy: [
        {
          id: 'session-1',
          name: 'Orchestrator session',
          provider: 'orchestrator',
          model: 'delegator',
          depth: 0,
          metadata: { messageCount: 2 },
          children: [
            {
              id: 'manager',
              name: 'Manager',
              provider: 'openai',
              model: 'gpt-4o-mini',
              depth: 1,
              metadata: { messageCount: 3 },
              children: [
                {
                  id: 'writer',
                  name: 'Writer',
                  provider: 'anthropic',
                  model: 'claude-3-5-sonnet',
                  depth: 2,
                  metadata: { messageCount: 1 },
                  children: [],
                },
              ],
            },
          ],
        },
      ],
    };

    render(<ToolTree {...(props as any)} />);

    const rootToggle = screen.getByRole('button', {
      name: 'Toggle Orchestrator session agents',
    });
    expect(rootToggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Manager')).toBeInTheDocument();

    const managerAgent = screen.getByText('Manager').closest('li');
    expect(managerAgent).not.toBeNull();

    const managerAgentsToggle = within(managerAgent!).getByRole('button', {
      name: 'Toggle Manager agents',
    });
    expect(managerAgentsToggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Writer')).toBeInTheDocument();

    const managerToolsToggle = within(managerAgent!).getByRole('button', {
      name: 'Toggle Manager tools',
    });
    expect(managerToolsToggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('fetch_documents')).not.toBeInTheDocument();

    await user.click(managerToolsToggle);

    expect(managerToolsToggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('fetch_documents')).toBeInTheDocument();

    const writerToolsToggle = screen.getByRole('button', {
      name: 'Toggle Writer tools',
    });
    expect(writerToolsToggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('write_report')).toBeInTheDocument();

    await user.click(rootToggle);
    expect(screen.queryByText('Manager')).not.toBeInTheDocument();

    await user.click(rootToggle);
    expect(screen.getByText('Manager')).toBeInTheDocument();
  });

  it('truncates long tool results in the tree view', () => {
    const longResult = 'x'.repeat(500);
    const expectedSummary = summarizeObject(longResult) ?? '';

    expect(expectedSummary.endsWith('…')).toBe(true);

    render(
      <ToolTree
        nodes={[
          {
            id: 'result-node',
            name: 'process',
            status: 'completed',
            metadata: {
              createdAt: '2024-03-01T00:00:00.000Z',
              result: longResult,
            },
            children: [],
          },
        ]}
      />,
    );

    const resultLabel = screen.getByText(`Result: ${expectedSummary}`);
    expect(resultLabel).toBeInTheDocument();
    expect(screen.queryByText(longResult)).not.toBeInTheDocument();
  });

  it('opens a dialog with full tool call data when the tool is clicked', async () => {
    const user = userEvent.setup();
    const longResult = 'x'.repeat(500);

    render(
      <ToolTree
        nodes={[
          {
            id: 'result-node',
            name: 'process',
            status: 'completed',
            metadata: {
              createdAt: '2024-03-01T00:00:00.000Z',
              result: longResult,
              arguments: { path: '/tmp/test' },
            },
            children: [],
          },
        ]}
      />,
    );

    const detailsTrigger = screen.getByRole('button', {
      name: 'View process tool call details',
    });

    expect(
      within(detailsTrigger).getByTestId(TOOL_DIALOG_CTA_ICON_TEST_ID),
    ).toBeInTheDocument();

    await user.click(detailsTrigger);

    const dialog = await screen.findByRole('dialog', {
      name: 'Tool call: process',
    });

    await user.click(
      within(dialog).getByRole('button', { name: 'Toggle metadata' }),
    );

    const resultEntry = within(dialog).getByTestId('json-entry-metadata.result');
    expect(resultEntry).toHaveTextContent(longResult);
  });

  it('updates agent tool listings when the nodes array reference stays stable', async () => {
    const user = userEvent.setup();
    const nodes = [
      {
        id: 'initial-tool',
        name: 'draft',
        status: 'pending' as const,
        metadata: {
          createdAt: '2024-05-01T00:00:00.000Z',
          agentId: 'agent-1',
        },
        children: [],
      },
    ];
    const agentHierarchy = [
      {
        id: 'agent-1',
        name: 'Planner',
        provider: 'openai',
        model: 'gpt-4o-mini',
        depth: 0,
        metadata: { messageCount: 1 },
        children: [],
      },
    ];

    const { rerender } = render(
      <ToolTree nodes={nodes as any} agentHierarchy={agentHierarchy as any} />,
    );

    const initialToggle = screen.getByRole('button', {
      name: 'Toggle Planner tools',
    });
    expect(initialToggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('draft')).toBeInTheDocument();

    nodes.push({
      id: 'follow-up',
      name: 'write_report',
      status: 'running' as const,
      metadata: {
        createdAt: '2024-05-01T00:05:00.000Z',
        agentId: 'agent-1',
      },
      children: [],
    });

    rerender(
      <ToolTree nodes={nodes as any} agentHierarchy={agentHierarchy as any} />,
    );

    const refreshedToggle = screen.getByRole('button', {
      name: 'Toggle Planner tools',
    });
    expect(refreshedToggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('write_report')).toBeInTheDocument();

    await user.click(refreshedToggle);
    expect(screen.queryByText('write_report')).not.toBeInTheDocument();

    await user.click(refreshedToggle);
    expect(screen.getByText('write_report')).toBeInTheDocument();
  });
});
