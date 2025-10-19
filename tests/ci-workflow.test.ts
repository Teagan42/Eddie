import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const workflowPath = new URL('../.github/workflows/ci.yml', import.meta.url);
const workflow = readFileSync(workflowPath, 'utf8');

function extractJobSection(jobId: string): string {
  const jobStart = workflow.indexOf(jobId);
  expect(jobStart).toBeGreaterThan(-1);

  const rest = workflow.slice(jobStart);
  const afterJob = rest.slice(jobId.length);
  const nextJobOffset = afterJob.search(/\r?\n  [a-z0-9-]+:/);

  if (nextJobOffset === -1) {
    return rest;
  }

  return rest.slice(0, jobId.length + nextJobOffset);
}

function expectAddAndCommitStep(
  jobSection: string,
  addPath: string | string[],
  commitMessage: string,
): void {
  expect(jobSection).toContain('uses: EndBug/add-and-commit@v9');
  expect(jobSection).toMatch(/add:/);
  const expectedPaths = Array.isArray(addPath)
    ? addPath
    : addPath.split('\n');
  for (const expectedPath of expectedPaths) {
    expect(jobSection).toContain(expectedPath);
  }
  expect(jobSection).toContain(`message: "${commitMessage}"`);
  expect(jobSection).toMatch(/push: true/);
  expect(jobSection).toMatch(/skip_empty: true/);
}

function expectDiffDetectionStep(
  jobSection: string,
  stepName: string,
  stepId: string,
  filePath: string | string[],
): void {
  expect(jobSection).toContain(stepName);
  expect(jobSection).toContain(`id: ${stepId}`);
  expect(jobSection).toContain('git diff --quiet -- "$file_path"');
  const expectedPaths = Array.isArray(filePath) ? filePath : [filePath];
  for (const expectedPath of expectedPaths) {
    expect(jobSection).toContain(expectedPath);
  }
}

function extractJobNeeds(jobSection: string): string[] {
  const match = jobSection.match(/\n {4}needs:\n((?: {6}- [^\n]+\n)+)/);

  if (!match) {
    return [];
  }

  return match[1]
    .trim()
    .split('\n')
    .map((line) => line.trim().replace(/^- /, ''));
}

describe('ci workflow configuration', () => {
  it('defines a combined build-test job', () => {
    expect(workflow).toContain('build-test:');
    expect(workflow).not.toMatch(/\nbuild:\n/);
  });

  it('builds the entire project before running matrix tests', () => {
    expect(workflow).toMatch(
      /build-test:[\s\S]*npm run build --workspaces[\s\S]*npm run test --workspace \$\{\{ matrix\.workspace\.name \}\} -- --coverage/
    );
  });

  it('quotes associative array keys containing hyphens', () => {
    expect(workflow).toMatch(
      /results\["build-test"\]="\$\{\{ needs\['build-test'\]\.result \}\}"/
    );
    expect(workflow).toMatch(/results\["\$job"\]/);
  });

  it('regenerates and commits the config schema diagram when it changes', () => {
    const jobSection = extractJobSection('docs-config-schema:');

    expect(jobSection).toMatch(/npm run docs:config-schema(\n|\s)/);
    expectDiffDetectionStep(
      jobSection,
      'Detect configuration schema changes',
      'config-schema-diff',
      [
        'docs/generated/config-schema-diagram.md',
        'docs/generated/config-schema.json',
      ],
    );
    expectAddAndCommitStep(
      jobSection,
      './docs/generated/config-schema-diagram.md\n./docs/generated/config-schema.json',
      'chore: update config schema diagram',
    );
    expect(jobSection).toMatch(
      /if: steps\.config-schema-diff\.outputs\.changed == 'true'/,
    );
    expect(jobSection).not.toMatch(/git push/);
  });

  it('regenerates and commits third-party notices only when they change', () => {
    const jobSection = extractJobSection('sync-third-party-licenses:');

    expect(jobSection).toMatch(/npm run licenses:write/);
    expectDiffDetectionStep(
      jobSection,
      'Detect third-party notice changes',
      'third-party-diff',
      'THIRD_PARTY_NOTICES.md',
    );
    expectAddAndCommitStep(
      jobSection,
      'THIRD_PARTY_NOTICES.md',
      'chore: update third-party notices',
    );
    expect(jobSection).toMatch(
      /if: steps\.third-party-diff\.outputs\.changed == 'true'/,
    );
    expect(jobSection).not.toMatch(/git push/);
  });

  it('runs license sync after docs diagram to avoid push conflicts', () => {
    const docsJob = extractJobSection('docs-config-schema:');
    const licensesJob = extractJobSection('sync-third-party-licenses:');

    expect(extractJobNeeds(docsJob)).toEqual([]);
    expect(extractJobNeeds(licensesJob)).toEqual(['docs-config-schema']);
  });
});
