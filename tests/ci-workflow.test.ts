import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const workflowPath = new URL('../.github/workflows/ci.yml', import.meta.url);
const workflow = readFileSync(workflowPath, 'utf8');

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
});
