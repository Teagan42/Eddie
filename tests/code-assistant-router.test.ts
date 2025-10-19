import { beforeAll, describe, expect, it } from 'vitest';

import { read } from './helpers/fs';

describe('code-assistant router instructions', () => {
  let conventions: string;
  let manager: string;

  beforeAll(() => {
    conventions = read('examples/code-assistant/prompts/partials/conventions.jinja');
    manager = read('examples/code-assistant/prompts/router_manager.jinja');
  });

  describe('conventions partial', () => {
    const conventionsExpectations: Array<{ name: string; pattern: RegExp }> = [
      {
        name: 'documents the spawn_subagent delegation schema',
        pattern: /Delegation \(spawn_subagent\)/i,
      },
      {
        name: 'explains how to invoke the spawn_subagent tool',
        pattern: /spawn_subagent tool/i,
      },
      {
        name: 'documents the get_plan planning tool',
        pattern: /get_plan tool/i,
      },
      {
        name: 'documents the update_plan adjustment tool',
        pattern: /update_plan tool/i,
      },
      {
        name: 'documents the complete_task closure tool',
        pattern: /complete_task tool/i,
      },
      {
        name: 'documents the get_folder_structure navigation tool',
        pattern: /get_folder_structure tool/i,
      },
      {
        name: 'documents the agent__get_task_list retrieval tool',
        pattern: /agent__get_task_list tool/i,
      },
      {
        name: 'documents the agent__new_task creation tool',
        pattern: /agent__new_task tool/i,
      },
      {
        name: 'documents the agent__set_task_status update tool',
        pattern: /agent__set_task_status tool/i,
      },
      {
        name: 'documents the agent__delete_task removal tool',
        pattern: /agent__delete_task tool/i,
      },
    ];

    it.each(conventionsExpectations)('%s', ({ pattern }) => {
      expect(conventions).toMatch(pattern);
    });
  });

  const managerExpectations: Array<{ name: string; pattern: RegExp }> = [
    {
      name: 'enforces continuous delegation until completion',
      pattern: /Continue delegating via spawn_subagent until the feature is complete/i,
    },
    {
      name: 'allows rerouting after quality gate failures',
      pattern: /If a quality_gate blocks progress, route back to red, green, or refactor as needed\./i,
    },
    {
      name: 'short circuits red when existing checks are failing',
      pattern:
        /Short circuit RED phase when the lint, build or test suite is already failing, GREEN should address/i,
    },
  ];

  describe('router manager', () => {
    it.each(managerExpectations)('%s', ({ pattern }) => {
      expect(manager).toMatch(pattern);
    });
  });
});
