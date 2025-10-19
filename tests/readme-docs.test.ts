import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const renameDeletePattern = /rename (and|or) delete chat sessions/i;
const platformDefaultsPath = 'platform/core/config/src/defaults.ts';

function readRootFile(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

describe('README documentation', () => {
  let readme: string;
  let featuresSection: string;

  beforeAll(() => {
    readme = readRootFile('../README.md');
    const featuresSectionMatch = readme.match(/## Features([\s\S]*?)## /);
    featuresSection = featuresSectionMatch?.[1] ?? '';
  });

  it('uses a title that reflects Eddie as a multi-surface agent platform', () => {
    expect(readme.startsWith('# Eddie: Multi-surface Agent Platform\n')).toBe(true);
  });

  it('highlights the web UI surface with screenshots', () => {
    expect(readme).toContain('## Web UI');
    expect(readme).toContain('docs/assets/ui-dashboard.png');
    expect(readme).toContain('docs/assets/ui-run-history.png');
  });

  it('mentions chat session rename and delete capabilities across surfaces', () => {
    expect(readme).toMatch(renameDeletePattern);
  });

  it('notes that the project was authored by AI collaborators', () => {
    expect(readme).toContain('This project was authored entirely by AI collaborators.');
  });

  it('documents the platform config defaults source path', () => {
    expect(readme).toContain(platformDefaultsPath);
  });

  it('enumerates every builtin tool in the features list', () => {
    expect(featuresSection).toContain('Tool registry');

    const builtinTools = [
      '`bash`',
      '`file_read`',
      '`file_write`',
      '`file_search`',
      '`get_folder_tree_structure`',
      '`get_plan`',
      '`update_plan`',
      '`complete_task`',
      '`agent__new_task_list`',
      '`agent__get_task_list`',
      '`agent__new_task`',
      '`agent__set_task_status`',
      '`agent__delete_task`',
    ];

    for (const tool of builtinTools) {
      expect(featuresSection).toContain(tool);
    }
  });

  it('lists the configuration wizard command in the CLI overview', () => {
    expect(readme).toContain('`eddie config`');
    expect(readme).toMatch(/configuration wizard/i);
  });
});
