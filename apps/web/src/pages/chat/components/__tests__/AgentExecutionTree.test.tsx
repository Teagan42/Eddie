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
});
