import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const workflowPath = new URL('../.github/workflows/tag-on-merge.yml', import.meta.url);
const indent = (spaces: number, content: string) => ' '.repeat(spaces) + content;

describe('tag on merge workflow', () => {
  let workflow: string;

  beforeAll(() => {
    workflow = readFileSync(workflowPath, 'utf8');
  });

  it('skips release automation for bot-authored release commits', () => {
    const conditionalSkip = [
      indent(4, 'if: >'),
      indent(6, '${{'),
      indent(8, "github.actor != 'github-actions[bot]' &&"),
      indent(8, "!contains(github.event.head_commit.message, 'chore: release v')"),
      indent(6, '}}'),
    ].join('\n');

    expect(workflow).toContain(conditionalSkip);
  });

  it('quotes release commit message to preserve colon parsing', () => {
    const quotedCommitMessage = indent(
      10,
      'commit-message: "chore: release v${{ steps.version.outputs.version }}"',
    );

    expect(workflow).toContain(quotedCommitMessage);
  });

  it('derives package version using an intermediate variable assignment', () => {
    const versionAssignment = 'VERSION=$(node -p "require(\'./package.json\').version")';
    const outputWrite = 'echo "version=$VERSION" >> "$GITHUB_OUTPUT"';

    expect(workflow).toContain(versionAssignment);
    expect(workflow).toContain(outputWrite);
  });
});
