import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const workflowPath = new URL('../.github/workflows/benchmarks.yml', import.meta.url);
const readmePath = new URL('../README.md', import.meta.url);
const docsPath = new URL('../docs/performance-benchmarks.md', import.meta.url);

describe('benchmarks workflow', () => {
  it('provisions database-backed performance reporting with regression alerts', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const absoluteOutputPath =
      'BENCHMARK_OUTPUT_PATH: ${{ github.workspace }}/packages/perf-benchmarks/benchmark-results.json';

    expect(workflow).toContain('name: Benchmarks');
    expect(workflow).toMatch(/on:\s+push:[\s\S]*branches:[\s\S]*- main/);
    expect(workflow).toContain('actions/checkout@v4');
    expect(workflow).toContain('./scripts/install.sh');
    expect(workflow).toMatch(
      /npm run bench --workspace @eddie\/perf-benchmarks -- --run [^\n]*--reporter=json/
    );
    expect(workflow).toContain(absoluteOutputPath);
    expect(workflow).toContain('services:');
    for (const service of ['postgres', 'mysql', 'mariadb']) {
      expect(workflow).toContain(`${service}:`);
    }
    for (const envVar of [
      'CHAT_SESSIONS_BENCH_POSTGRES_URL',
      'CHAT_SESSIONS_BENCH_MYSQL_URL',
      'CHAT_SESSIONS_BENCH_MARIADB_URL',
    ]) {
      expect(workflow).toContain(envVar);
    }
    expect(workflow).toContain('uses: benchmark-action/github-action-benchmark@v1');
    expect(workflow).toContain('gh-pages-branch: benchmarks');
    expect(workflow).toMatch(/fail-on-alert: true/);
    expect(workflow).toMatch(/alert-threshold: '5%'/);
    expect(workflow).toContain('uses: actions/upload-artifact@');
  });

  it('ensures database services allow ample time for startup health checks', () => {
    const workflow = readFileSync(workflowPath, 'utf8');

    for (const service of ['mysql', 'mariadb']) {
      expect(workflow).toMatch(new RegExp(`${service}:[\\s\\S]*--health-start-period=40s`));
    }
  });

  it('documents where to find reports and what alerts mean', () => {
    const readme = readFileSync(readmePath, 'utf8');
    const docs = readFileSync(docsPath, 'utf8');

    expect(readme).toContain('https://github.com/Teagan42/Eddie/tree/benchmarks');
    expect(readme).toMatch(/regression alerts/i);
    expect(docs).toContain('benchmarks.yml');
    expect(docs).toContain('https://github.com/Teagan42/Eddie/tree/benchmarks');
    expect(docs).toMatch(/alert notifications/i);
  });
});
