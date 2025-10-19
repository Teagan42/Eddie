import { beforeAll, describe, expect, it } from 'vitest';

import { read } from './helpers/fs';

const planModulePath = 'platform/runtime/tools/src/builtin/plan.ts';
const fileSearchModulePath = 'platform/runtime/tools/src/builtin/file_search.ts';
const treeModulePath =
  'platform/runtime/tools/src/builtin/get_folder_tree_structure.ts';
const bashModulePath = 'platform/runtime/tools/src/builtin/bash.ts';
const fileWriteModulePath = 'platform/runtime/tools/src/builtin/file_write.ts';
const runtimeToolsReadmePath = 'platform/runtime/tools/README.md';
const builtinToolNames = [
  'bash',
  'file_read',
  'file_write',
  'file_search',
  'get_folder_tree_structure',
  'get_plan',
  'complete_task',
  'update_plan',
];

describe('tools documentation', () => {
  let doc: string;
  let runtimeReadme: string;

  beforeAll(() => {
    doc = read('docs/tools.md');
    runtimeReadme = read(runtimeToolsReadmePath);
  });

  it('documents plan management workflow and schemas', () => {
    expect(doc).toContain('get_plan');
    expect(doc).toContain('update_plan');
    expect(doc).toContain('complete_task');
    expect(doc).toContain('CONFIG_ROOT');
    expect(doc).toContain('plan.directory');
    expect(doc).toContain('PlanDocument');
    expect(doc).toContain('PlanTask');
    expect(doc).toContain('PLAN_RESULT_SCHEMA');
    expect(doc).toContain(planModulePath);
  });

  it('explains file_search filters, pagination, and schema reference', () => {
    expect(doc).toContain('file_search');
    expect(doc).toContain('include');
    expect(doc).toContain('exclude');
    expect(doc).toContain('includeDependencies');
    expect(doc).toContain('pageSize');
    expect(doc).toContain(fileSearchModulePath);
  });

  it('covers get_folder_tree_structure options with schema link', () => {
    expect(doc).toContain('get_folder_tree_structure');
    expect(doc).toContain('includeHidden');
    expect(doc).toContain('maxDepth');
    expect(doc).toContain('maxEntries');
    expect(doc).toContain('offset');
    expect(doc).toContain('includeDependencies');
    expect(doc).toContain(treeModulePath);
  });

  it('cross-links runtime reference for interactive and mutation tools', () => {
    expect(doc).toContain('../platform/runtime/tools/README.md#bash');
    expect(doc).toContain('../platform/runtime/tools/README.md#file_write');
    expect(doc).toContain(bashModulePath);
    expect(doc).toContain(fileWriteModulePath);
  });

  it('documents runtime README sections for every built-in tool', () => {
    for (const tool of builtinToolNames) {
      expect(runtimeReadme).toContain(`### \`${tool}\``);
    }

    const parameterHeadings = runtimeReadme.match(/#### Parameters/g) ?? [];
    const outputHeadings = runtimeReadme.match(/#### Outputs/g) ?? [];
    const safetyHeadings =
      runtimeReadme.match(/#### Safety considerations/g) ?? [];

    expect(parameterHeadings).toHaveLength(builtinToolNames.length);
    expect(outputHeadings).toHaveLength(builtinToolNames.length);
    expect(safetyHeadings).toHaveLength(builtinToolNames.length);
  });

  it('notes confirmation flow for bash and file writes in runtime README', () => {
    expect(runtimeReadme).toContain(bashModulePath);
    expect(runtimeReadme).toContain(fileWriteModulePath);
    expect(runtimeReadme).toContain('ctx.confirm');
    expect(runtimeReadme.toLowerCase()).toContain('confirmation prompt');
  });
});
