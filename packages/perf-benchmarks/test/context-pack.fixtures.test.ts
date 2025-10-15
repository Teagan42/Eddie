import { mkdtemp, rm, stat, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { prepareContextPackDatasets } from '../src/context-pack.fixtures';

describe('prepareContextPackDatasets', () => {
  const datasetsExpectation = [
    { name: '10x1KB', fileCount: 10, totalBytes: 10 * 1024 },
    { name: '100x10KB', fileCount: 100, totalBytes: 100 * 10 * 1024 },
    { name: '500x100KB', fileCount: 500, totalBytes: 500 * 100 * 1024 },
  ];

  it('creates the expected datasets with file counts and byte sizes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'context-pack-fixtures-'));

    try {
      const datasets = await prepareContextPackDatasets(root);

      expect(datasets).toHaveLength(datasetsExpectation.length);

      for (let index = 0; index < datasetsExpectation.length; index += 1) {
        const expectation = datasetsExpectation[index]!;
        const dataset = datasets[index]!;

        expect(dataset.name).toBe(expectation.name);
        expect(dataset.fileCount).toBe(expectation.fileCount);
        expect(dataset.totalBytes).toBe(expectation.totalBytes);

        const files = await readdir(dataset.root);
        expect(files.length).toBe(expectation.fileCount);

        let accumulatedSize = 0;
        for (const file of files) {
          const { size } = await stat(join(dataset.root, file));
          accumulatedSize += size;
        }

        expect(accumulatedSize).toBe(expectation.totalBytes);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
