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

  it('regenerates and pushes third-party notices', () => {
    const jobStart = workflow.indexOf('sync-third-party-licenses:');
    expect(jobStart).toBeGreaterThan(-1);

    const summaryStart = workflow.indexOf('\n  summary:', jobStart);
    const jobSection = summaryStart === -1 ? workflow.slice(jobStart) : workflow.slice(jobStart, summaryStart);

    expect(jobSection).toMatch(/npm run licenses:write/);
    expect(jobSection).toMatch(
      /git commit --all --message "chore: update third-party notices"/
    );
    expect(jobSection).toMatch(/git push/);
  });
});
