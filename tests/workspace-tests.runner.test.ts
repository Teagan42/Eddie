import { describe, expect, it, vi } from 'vitest';
import os from 'node:os';
import { createTestResult, determineConcurrency, runWithConcurrency } from '../scripts/workspace-tests';

describe('workspace test runner concurrency', () => {
  it('does not exceed the requested concurrency', async () => {
    const activeCounts: number[] = [];
    let active = 0;
    const tasks = Array.from({ length: 6 }, (_, index) => async () => {
      active += 1;
      activeCounts.push(active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return index;
    });

    const results = await runWithConcurrency(tasks, 2);

    expect(results).toEqual([0, 1, 2, 3, 4, 5]);
    expect(Math.max(...activeCounts)).toBeLessThanOrEqual(2);
  });

  it('caps default concurrency to three workers', () => {
    const previous = process.env.WORKSPACE_TEST_CONCURRENCY;
    delete process.env.WORKSPACE_TEST_CONCURRENCY;

    const cpuSpy = vi
      .spyOn(os, 'cpus')
      .mockReturnValue(
        Array.from({ length: 8 }, () => ({
          model: 'test',
          speed: 0,
          times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 },
        })),
      );

    try {
      expect(determineConcurrency(10)).toBe(3);
    } finally {
      cpuSpy.mockRestore();

      if (previous !== undefined) {
        process.env.WORKSPACE_TEST_CONCURRENCY = previous;
      } else {
        delete process.env.WORKSPACE_TEST_CONCURRENCY;
      }
    }
  });

  it('treats signaled processes as failures', () => {
    const result = createTestResult('example', null, 'SIGTERM');

    expect(result.code).toBe(1);
    expect(result.signal).toBe('SIGTERM');
  });

  it('preserves non-zero exit codes alongside signals', () => {
    const result = createTestResult('example', 137, 'SIGKILL');

    expect(result.code).toBe(137);
    expect(result.signal).toBe('SIGKILL');
  });
});
