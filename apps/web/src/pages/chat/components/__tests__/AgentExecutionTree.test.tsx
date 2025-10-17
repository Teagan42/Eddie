import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AgentExecutionTree } from '../AgentExecutionTree';

describe('AgentExecutionTree', () => {
  it('groups tool invocations under each agent with previews and a details CTA', async () => {
    const user = userEvent.setup();
    render(
      <AgentExecutionTree
        metadata={{
          agentHierarchy: [
            {
              id: 'root-agent',
              name: 'orchestrator',
              provider: 'openai',
              model: 'gpt-4o',
              depth: 0,
              metadata: { messageCount: 3 },
              children: [],
            },
          ],
          toolInvocations: [
            {
              id: 'tool-1',
              name: 'browse-web',
              status: 'completed',
              createdAt: '2024-05-01T12:00:00.000Z',
              updatedAt: '2024-05-01T12:01:00.000Z',
              args: { query: 'latest weather updates near San Francisco, CA with details' },
              result: {
                output:
                  'Partly cloudy with highs of 72°F. Expect light winds from the northwest and clear skies overnight.',
              },
              metadata: { agentId: 'root-agent' },
            },
            {
              id: 'tool-2',
              name: 'fetch-weather',
              status: 'pending',
              createdAt: '2024-05-01T12:02:00.000Z',
              updatedAt: '2024-05-01T12:02:00.000Z',
              args: { location: 'San Francisco, CA' },
              metadata: { agentId: 'root-agent' },
            },
          ],
          contextBundles: [
            {
              id: 'bundle-1',
              title: 'User Profile',
              source: 'system',
              createdAt: '2024-05-01T11:55:00.000Z',
              metadata: { tags: ['beta-tester'] },
              files: [
                {
                  id: 'file-1',
                  name: 'preferences.json',
                  size: 128,
                  metadata: { mediaType: 'application/json' },
                },
              ],
            },
          ],
        }}
        selectedAgentId={null}
        onSelectAgent={() => {}}
      />,
    );

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
      within(invocation.closest('li') as HTMLLIElement).getByText(/latest weather updates near San Francisco/i),
    ).toBeInTheDocument();

    const detailsButton = within(invocation.closest('li') as HTMLLIElement).getByRole('button', {
      name: /view full tool invocation details/i,
    });

    await user.click(detailsButton);

    expect(screen.getByRole('dialog', { name: /tool invocation details/i })).toBeInTheDocument();
    expect(screen.getByText(/preferences.json/)).toBeInTheDocument();
  });
});
