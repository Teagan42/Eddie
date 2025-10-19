import { beforeAll, describe, expect, it } from 'vitest';

import { read } from './helpers/fs';

const planModulePath = 'platform/runtime/tools/src/builtin/plan.ts';
const fileSearchModulePath = 'platform/runtime/tools/src/builtin/file_search.ts';
const treeModulePath =
  'platform/runtime/tools/src/builtin/get_folder_tree_structure.ts';

describe('tools documentation', () => {
  let doc: string;

  beforeAll(() => {
    doc = read('docs/tools.md');
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
});
