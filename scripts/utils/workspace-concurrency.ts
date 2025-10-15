import os from 'node:os';
import process from 'node:process';

function parsePositiveInteger(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function determineConcurrency(totalWorkspaces: number): number {
  if (totalWorkspaces <= 0) {
    return 0;
  }

  const parsedEnv = parsePositiveInteger(process.env.WORKSPACE_TEST_CONCURRENCY);
  if (parsedEnv) {
    return Math.min(parsedEnv, totalWorkspaces);
  }

  const cpuCount = os.cpus()?.length ?? 1;
  const recommended = Math.min(3, cpuCount);
  return Math.min(recommended, totalWorkspaces);
}

type AsyncTask<T> = () => Promise<T>;

export async function runWithConcurrency<T>(tasks: AsyncTask<T>[], concurrency: number): Promise<T[]> {
  if (tasks.length === 0) {
    return [];
  }

  if (!Number.isFinite(concurrency) || concurrency < 1) {
    throw new Error('Concurrency must be a positive integer.');
  }

  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;
  let firstError: unknown;
  const workerCount = Math.min(concurrency, tasks.length);

  async function worker(): Promise<void> {
    while (true) {
      if (firstError) {
        return;
      }

      const currentIndex = nextIndex;
      nextIndex += 1;

      if (currentIndex >= tasks.length) {
        return;
      }

      try {
        results[currentIndex] = await tasks[currentIndex]();
      } catch (error) {
        firstError = error;
      }
    }
  }

  const workers = Array.from({ length: workerCount }, () => worker());

  await Promise.all(workers);

  if (firstError) {
    throw firstError;
  }

  return results;
}
