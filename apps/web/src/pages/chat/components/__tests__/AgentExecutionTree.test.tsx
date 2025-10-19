import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { OrchestratorMetadataDto } from '@eddie/api-client';
import type { ExecutionContextBundle, ExecutionTreeState } from '@eddie/types';

import { AgentExecutionTree } from '../AgentExecutionTree';
import { createExecutionTreeStateFromMetadata } from '../../execution-tree-state';

describe('AgentExecutionTree', () => {
  it('groups tool invocations under each agent with previews and a details CTA', async () => {
    const user = userEvent.setup();
    const completedInvocation: ExecutionTreeState['toolInvocations'][number] = {
      id: 'tool-1',
      agentId: 'root-agent',
      name: 'browse-web',
      status: 'completed',
      createdAt: '2024-05-01T12:00:00.000Z',
      updatedAt: '2024-05-01T12:01:00.000Z',
      metadata: {
        args: { query: 'latest weather updates near San Francisco, CA with details' },
        result: {
          output:
            'Partly cloudy with highs of 72°F. Expect light winds from the northwest and clear skies overnight.',
        },
      },
      children: [],
    };
    const pendingInvocation: ExecutionTreeState['toolInvocations'][number] = {
      id: 'tool-2',
      agentId: 'root-agent',
      name: 'fetch-weather',
      status: 'pending',
      createdAt: '2024-05-01T12:02:00.000Z',
      updatedAt: '2024-05-01T12:02:00.000Z',
      metadata: { args: { location: 'San Francisco, CA' } },
      children: [],
    };
    const contextBundle: ExecutionContextBundle = {
      id: 'bundle-1',
      label: 'User Profile',
      summary: 'Preferred travel destinations and preferences',
      sizeBytes: 128,
      fileCount: 1,
      files: [
        {
          path: 'preferences.json',
          sizeBytes: 128,
          preview: '{"preferredCity":"San Francisco"}',
        },
      ],
      source: { type: 'tool_result', agentId: 'root-agent', toolCallId: 'tool-1' },
    };

    const executionTree: ExecutionTreeState = {
      agentHierarchy: [
        {
          id: 'root-agent',
          name: 'orchestrator',
          provider: 'openai',
          model: 'gpt-4o',
          depth: 0,
          lineage: ['root-agent'],
          children: [],
        },
      ],
      toolInvocations: [completedInvocation, pendingInvocation],
      contextBundles: [contextBundle],
      agentLineageById: { 'root-agent': ['root-agent'] },
      toolGroupsByAgentId: {
        'root-agent': {
          pending: [pendingInvocation],
          running: [],
          completed: [completedInvocation],
          failed: [],
        },
      },
      contextBundlesByAgentId: { 'root-agent': [contextBundle] },
      contextBundlesByToolCallId: { 'tool-1': [contextBundle] },
      createdAt: '2024-05-01T12:00:00.000Z',
      updatedAt: '2024-05-01T12:02:00.000Z',
    };

    const metadata = {
      executionTree,
    } as unknown as OrchestratorMetadataDto;

    const tree = (
      <AgentExecutionTree
        state={createExecutionTreeStateFromMetadata(metadata)}
        selectedAgentId={null}
        onSelectAgent={() => {}}
      />
    );

    render(tree);

    const agentSection = screen.getByRole('button', { name: /select orchestrator agent/i });
    expect(agentSection).toBeInTheDocument();

    const completedGroup = screen.getByRole('button', {
      name: /toggle completed tool invocations for orchestrator/i,
    });
    await user.click(completedGroup);

    const completedList = screen.getByRole('region', {
      name: /completed tool invocations for orchestrator/i,
    });
    const invocation = within(completedList).getByText(/browse-web/i);
    expect(invocation).toBeInTheDocument();
    expect(
      within(invocation.closest('li') as HTMLLIElement).getByText(/partly cloudy/i),
    ).toBeInTheDocument();

    const detailsButton = within(invocation.closest('li') as HTMLLIElement).getByRole('button', {
      name: /view full tool invocation details/i,
    });

    await user.click(detailsButton);

    expect(screen.getByRole('dialog', { name: /tool invocation details/i })).toBeInTheDocument();
    expect(screen.getByText(/preferences.json/)).toBeInTheDocument();
  });

  it('retains previews from invocation metadata when args and result fields are missing', async () => {
    const user = userEvent.setup();
    const invocation: ExecutionTreeState['toolInvocations'][number] = {
      id: 'tool-with-metadata',
      agentId: 'root-agent',
      name: 'ingest-records',
      status: 'completed',
      createdAt: '2024-05-01T12:03:00.000Z',
      updatedAt: '2024-05-01T12:03:30.000Z',
      metadata: {
        args: { source: 'records.csv' },
        result: 'All good',
      },
      children: [],
    };

    const executionTree: ExecutionTreeState = {
      agentHierarchy: [
        {
          id: 'root-agent',
          name: 'orchestrator',
          provider: 'openai',
          model: 'gpt-4o',
          depth: 0,
          lineage: ['root-agent'],
          children: [],
        },
      ],
      toolInvocations: [invocation],
      contextBundles: [],
      agentLineageById: { 'root-agent': ['root-agent'] },
      toolGroupsByAgentId: {
        'root-agent': {
          pending: [],
          running: [],
          completed: [invocation],
          failed: [],
        },
      },
      contextBundlesByAgentId: { 'root-agent': [] },
      contextBundlesByToolCallId: {},
      createdAt: '2024-05-01T12:03:00.000Z',
      updatedAt: '2024-05-01T12:03:30.000Z',
    };

    render(
      <AgentExecutionTree state={executionTree} selectedAgentId={null} onSelectAgent={() => {}} />,
    );

    const completedToggle = screen.getByRole('button', {
      name: /toggle completed tool invocations for orchestrator/i,
    });
    await user.click(completedToggle);

    const completedRegion = screen.getByRole('region', {
      name: /completed tool invocations for orchestrator/i,
    });

    expect(within(completedRegion).getByText(/ingest-records/i)).toBeInTheDocument();
    expect(within(completedRegion).getByText('All good')).toBeInTheDocument();
  });

  it('orders tool invocations in each status group with newest entries first', async () => {
    const user = userEvent.setup();
    const olderInvocation: ExecutionTreeState['toolInvocations'][number] = {
      id: 'tool-old',
      agentId: 'root-agent',
      name: 'fetch-weather',
      status: 'completed',
      createdAt: '2024-05-01T11:59:00.000Z',
      updatedAt: '2024-05-01T12:00:00.000Z',
      metadata: { args: { query: 'weather' } },
      children: [],
    };
    const newerInvocation: ExecutionTreeState['toolInvocations'][number] = {
      id: 'tool-new',
      agentId: 'root-agent',
      name: 'browse-web',
      status: 'completed',
      createdAt: '2024-05-01T12:01:00.000Z',
      updatedAt: '2024-05-01T12:02:00.000Z',
      metadata: { args: { query: 'latest headlines' } },
      children: [],
    };

    const executionTree: ExecutionTreeState = {
      agentHierarchy: [
        {
          id: 'root-agent',
          name: 'orchestrator',
          provider: 'openai',
          model: 'gpt-4o',
          depth: 0,
          lineage: ['root-agent'],
          children: [],
        },
      ],
      toolInvocations: [olderInvocation, newerInvocation],
      contextBundles: [],
      agentLineageById: { 'root-agent': ['root-agent'] },
      toolGroupsByAgentId: {
        'root-agent': {
          pending: [],
          running: [],
          completed: [olderInvocation, newerInvocation],
          failed: [],
        },
      },
      contextBundlesByAgentId: { 'root-agent': [] },
      contextBundlesByToolCallId: {},
      createdAt: '2024-05-01T11:59:00.000Z',
      updatedAt: '2024-05-01T12:02:00.000Z',
    };

    const metadata = {
      executionTree,
    } as unknown as OrchestratorMetadataDto;

    render(
      <AgentExecutionTree
        state={createExecutionTreeStateFromMetadata(metadata)}
        selectedAgentId={null}
        onSelectAgent={() => {}}
      />,
    );

    const completedToggle = screen.getByRole('button', {
      name: /toggle completed tool invocations for orchestrator/i,
    });
    await user.click(completedToggle);

    const completedList = screen.getByRole('region', {
      name: /completed tool invocations for orchestrator/i,
    });

    const items = completedList.querySelectorAll(':scope > ul > li');
    expect(items).toHaveLength(2);
    expect(within(items[0] as HTMLElement).getByText(/browse-web/i)).toBeInTheDocument();
    expect(within(items[1] as HTMLElement).getByText(/fetch-weather/i)).toBeInTheDocument();
  });

  it('styles the tool invocation details button with a tinted background', async () => {
    const user = userEvent.setup();
    const invocation: ExecutionTreeState['toolInvocations'][number] = {
      id: 'tool-cta',
      agentId: 'root-agent',
      name: 'fetch-weather',
      status: 'pending',
      createdAt: '2024-05-01T12:00:00.000Z',
      updatedAt: '2024-05-01T12:00:00.000Z',
      metadata: { args: { query: 'San Francisco' } },
      children: [],
    };

    const executionTree: ExecutionTreeState = {
      agentHierarchy: [
        {
          id: 'root-agent',
          name: 'orchestrator',
          provider: 'openai',
          model: 'gpt-4o',
          depth: 0,
          lineage: ['root-agent'],
          children: [],
        },
      ],
      toolInvocations: [invocation],
      contextBundles: [],
      agentLineageById: { 'root-agent': ['root-agent'] },
      toolGroupsByAgentId: {
        'root-agent': {
          pending: [invocation],
          running: [],
          completed: [],
          failed: [],
        },
      },
      contextBundlesByAgentId: { 'root-agent': [] },
      contextBundlesByToolCallId: {},
      createdAt: '2024-05-01T12:00:00.000Z',
      updatedAt: '2024-05-01T12:00:00.000Z',
    };

    const metadata = {
      executionTree,
    } as unknown as OrchestratorMetadataDto;

    render(
      <AgentExecutionTree
        state={createExecutionTreeStateFromMetadata(metadata)}
        selectedAgentId={null}
        onSelectAgent={() => {}}
      />,
    );

    const pendingToggle = screen.getByRole('button', {
      name: /toggle pending tool invocations for orchestrator/i,
    });
    await user.click(pendingToggle);

    const pendingList = screen.getByRole('region', {
      name: /pending tool invocations for orchestrator/i,
    });

    const detailsButton = within(pendingList).getByRole('button', {
      name: /view full tool invocation details/i,
    });

    expect(detailsButton).toHaveClass('bg-accent/5');
  });

  it('applies transition classes for smooth agent and tool animations', async () => {
    const user = userEvent.setup();
    const invocation: ExecutionTreeState['toolInvocations'][number] = {
      id: 'tool-animate',
      agentId: 'root-agent',
      name: 'summarize',
      status: 'completed',
      createdAt: '2024-05-01T12:00:00.000Z',
      updatedAt: '2024-05-01T12:01:00.000Z',
      metadata: { result: { summary: 'Done' } },
      children: [],
    };

    const executionTree: ExecutionTreeState = {
      agentHierarchy: [
        {
          id: 'root-agent',
          name: 'orchestrator',
          provider: 'openai',
          model: 'gpt-4o',
          depth: 0,
          lineage: ['root-agent'],
          children: [
            {
              id: 'child-agent',
              name: 'delegate',
              provider: 'anthropic',
              model: 'claude-3',
              depth: 1,
              lineage: ['root-agent', 'child-agent'],
              children: [],
            },
          ],
        },
      ],
      toolInvocations: [invocation],
      contextBundles: [],
      agentLineageById: {
        'root-agent': ['root-agent'],
        'child-agent': ['root-agent', 'child-agent'],
      },
      toolGroupsByAgentId: {
        'root-agent': {
          pending: [],
          running: [],
          completed: [invocation],
          failed: [],
        },
      },
      contextBundlesByAgentId: { 'root-agent': [] },
      contextBundlesByToolCallId: {},
      createdAt: '2024-05-01T12:00:00.000Z',
      updatedAt: '2024-05-01T12:01:00.000Z',
    };

    const metadata = {
      executionTree,
    } as unknown as OrchestratorMetadataDto;

    render(
      <AgentExecutionTree
        state={createExecutionTreeStateFromMetadata(metadata)}
        selectedAgentId={null}
        onSelectAgent={() => {}}
      />,
    );

    const agentCard = screen.getByRole('button', { name: /select orchestrator agent/i }).closest('li');
    expect(agentCard).toHaveClass('transition-all');

    const completedToggle = screen.getByRole('button', {
      name: /toggle completed tool invocations for orchestrator/i,
    });
    await user.click(completedToggle);

    const completedRegion = screen.getByRole('region', {
      name: /completed tool invocations for orchestrator/i,
    });
    expect(completedRegion).toHaveClass('transition-all');

    const toolItems = completedRegion.querySelectorAll(':scope > ul > li');
    expect(toolItems[0]).toHaveClass('transition-all');
  });

  it('auto-expands agents with children on initial render', () => {
    const executionTree: ExecutionTreeState = {
      agentHierarchy: [
        {
          id: 'root-agent',
          name: 'orchestrator',
          provider: 'openai',
          model: 'gpt-4o',
          depth: 0,
          lineage: ['root-agent'],
          children: [
            {
              id: 'child-agent',
              name: 'delegate',
              provider: 'anthropic',
              model: 'claude-3',
              depth: 1,
              lineage: ['root-agent', 'child-agent'],
              children: [
                {
                  id: 'grandchild-agent',
                  name: 'specialist',
                  provider: 'openai',
                  model: 'gpt-4o-mini',
                  depth: 2,
                  lineage: ['root-agent', 'child-agent', 'grandchild-agent'],
                  children: [],
                },
              ],
            },
          ],
        },
      ],
      toolInvocations: [],
      contextBundles: [],
      agentLineageById: {
        'root-agent': ['root-agent'],
        'child-agent': ['root-agent', 'child-agent'],
        'grandchild-agent': ['root-agent', 'child-agent', 'grandchild-agent'],
      },
      toolGroupsByAgentId: {},
      contextBundlesByAgentId: {},
      contextBundlesByToolCallId: {},
      createdAt: '2024-05-01T12:00:00.000Z',
      updatedAt: '2024-05-01T12:00:00.000Z',
    };

    const metadata = {
      executionTree,
    } as unknown as OrchestratorMetadataDto;

    render(
      <AgentExecutionTree
        state={createExecutionTreeStateFromMetadata(metadata)}
        selectedAgentId={null}
        onSelectAgent={() => {}}
      />,
    );

    const toggle = screen.getByRole('button', {
      name: /toggle spawned agents for orchestrator/i,
    });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    const subAgentRegion = screen.getByRole('region', {
      name: /spawned agents for orchestrator/i,
    });
    expect(subAgentRegion).toBeInTheDocument();

    const childToggle = screen.getByRole('button', {
      name: /toggle spawned agents for delegate/i,
    });
    expect(childToggle).toHaveAttribute('aria-expanded', 'true');

    const nestedRegion = screen.getByRole('region', {
      name: /spawned agents for delegate/i,
    });
    expect(nestedRegion).toBeInTheDocument();
  });

  it("shows only the selected agent's context bundles when expanded", async () => {
    const user = userEvent.setup();

    const rootBundle = {
      id: 'bundle-root',
      label: 'Root bundle label',
      title: 'Root agent context',
      summary: 'Context gathered by root',
      sizeBytes: 256,
      fileCount: 0,
      files: [],
      source: 'Root tool call source',
    } as ExecutionContextBundle & { title: string; source: string };

    const delegateBundle = {
      id: 'bundle-delegate',
      label: 'Delegate bundle label',
      title: 'Delegate agent context',
      summary: 'Context gathered by delegate',
      sizeBytes: 512,
      fileCount: 0,
      files: [],
      source: 'Delegate tool call source',
    } as ExecutionContextBundle & { title: string; source: string };

    const state: ExecutionTreeState = {
      agentHierarchy: [
        {
          id: 'root-agent',
          name: 'orchestrator',
          provider: 'openai',
          model: 'gpt-4o',
          depth: 0,
          lineage: ['root-agent'],
          children: [],
        },
        {
          id: 'delegate-agent',
          name: 'delegate',
          provider: 'anthropic',
          model: 'claude-3',
          depth: 0,
          lineage: ['delegate-agent'],
          children: [],
        },
      ],
      toolInvocations: [],
      contextBundles: [rootBundle, delegateBundle],
      agentLineageById: {
        'root-agent': ['root-agent'],
        'delegate-agent': ['delegate-agent'],
      },
      toolGroupsByAgentId: {},
      contextBundlesByAgentId: {
        'root-agent': [rootBundle],
        'delegate-agent': [delegateBundle],
      },
      contextBundlesByToolCallId: {
        'tool-root': [rootBundle],
        'tool-delegate': [delegateBundle],
      },
      createdAt: '2024-05-01T12:00:00.000Z',
      updatedAt: '2024-05-01T12:00:00.000Z',
    };

    render(
      <AgentExecutionTree state={state} selectedAgentId={null} onSelectAgent={() => {}} />,
    );

    const rootContextToggle = screen.getByRole('button', {
      name: /toggle context bundles for orchestrator/i,
    });
    await user.click(rootContextToggle);

    const rootContextRegion = screen.getByRole('region', {
      name: /context bundles for orchestrator/i,
    });
    expect(
      within(rootContextRegion).getByText(/root agent context/i),
    ).toBeInTheDocument();
    expect(
      within(rootContextRegion).queryByText(/delegate agent context/i),
    ).not.toBeInTheDocument();

    const delegateContextToggle = screen.getByRole('button', {
      name: /toggle context bundles for delegate/i,
    });
    await user.click(delegateContextToggle);

    const delegateContextRegion = screen.getByRole('region', {
      name: /context bundles for delegate/i,
    });
    expect(
      within(delegateContextRegion).getByText(/delegate agent context/i),
    ).toBeInTheDocument();
  });

  it('wraps expandable tool and context sections in motion regions', async () => {
    const user = userEvent.setup();

    const agent: ExecutionTreeState['agentHierarchy'][number] = {
      id: 'root-agent',
      name: 'Root agent',
      provider: 'openai',
      model: 'gpt-4o',
      depth: 0,
      lineage: ['root-agent'],
      children: [],
    };

    const completedInvocation: ExecutionTreeState['toolInvocations'][number] = {
      id: 'tool-1',
      agentId: agent.id,
      name: 'search-web',
      status: 'completed',
      createdAt: '2024-05-01T12:00:00.000Z',
      updatedAt: '2024-05-01T12:01:00.000Z',
      metadata: {},
      children: [],
    };

    const contextBundle: ExecutionContextBundle = {
      id: 'bundle-1',
      label: 'Latest insights',
      summary: 'Summaries from the latest tool output',
      sizeBytes: 128,
      fileCount: 0,
      files: [],
      source: { type: 'tool_result', agentId: agent.id, toolCallId: completedInvocation.id },
    };

    const state: ExecutionTreeState = {
      agentHierarchy: [agent],
      toolInvocations: [completedInvocation],
      contextBundles: [contextBundle],
      agentLineageById: { [agent.id]: [agent.id] },
      toolGroupsByAgentId: {
        [agent.id]: {
          pending: [],
          running: [],
          completed: [completedInvocation],
          failed: [],
        },
      },
      contextBundlesByAgentId: { [agent.id]: [contextBundle] },
      contextBundlesByToolCallId: { [completedInvocation.id]: [contextBundle] },
      createdAt: '2024-05-01T12:00:00.000Z',
      updatedAt: '2024-05-01T12:01:00.000Z',
    };

    render(
      <AgentExecutionTree state={state} selectedAgentId={null} onSelectAgent={() => {}} />,
    );

    await user.click(
      screen.getByRole('button', {
        name: /toggle completed tool invocations for root agent/i,
      }),
    );

    const toolRegion = screen.getByRole('region', {
      name: /completed tool invocations for root agent/i,
    });

    expect(
      within(toolRegion).getByTestId('agent-execution-tree-tool-group-motion'),
    ).toHaveAttribute('data-motion', 'agent-execution-tree-tool-group');

    await user.click(
      screen.getByRole('button', { name: /toggle context bundles for root agent/i }),
    );

    const contextRegion = screen.getByRole('region', {
      name: /context bundles for root agent/i,
    });

    expect(
      within(contextRegion).getByTestId('agent-execution-tree-context-motion'),
    ).toHaveAttribute('data-motion', 'agent-execution-tree-context');
  });
});
