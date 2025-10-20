import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AgentExecutionTree } from '../../src/chat/AgentExecutionTree';
import type { ExecutionTreeState } from '../../src/chat/types';
import { renderWithUIProviders } from '../test-utils';

function createTreeState(): ExecutionTreeState {
  return {
    agentHierarchy: [
      {
        id: 'captain',
        name: 'Captain Agent',
        status: 'active',
        children: [
          {
            id: 'delegate',
            name: 'Delegate Agent',
            children: [],
          },
        ],
      },
    ],
    toolInvocations: [],
    contextBundles: [],
    contextBundlesByAgentId: {},
    toolGroupsByAgentId: {},
    agentLineageById: {
      captain: [],
      delegate: ['captain'],
    },
  };
}

describe('AgentExecutionTree', () => {
  it('expands agent children when toggled', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();

    renderWithUIProviders(
      <AgentExecutionTree
        state={createTreeState()}
        selectedAgentId={null}
        onSelectAgent={onSelectAgent}
      />,
    );

    expect(screen.getByText('Delegate Agent')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /collapse captain agent/i }));

    await waitFor(() => {
      expect(screen.queryByText('Delegate Agent')).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /expand captain agent/i }));

    expect(await screen.findByText('Delegate Agent')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /select captain agent/i }));

    expect(onSelectAgent).toHaveBeenCalledWith('captain');
  });
});
