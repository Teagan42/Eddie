import { access, mkdir, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { join } from 'node:path';

export interface ContextPackResourceBundle {
  readonly name: string;
  readonly path: string;
  readonly bytes: number;
}

export interface ContextPackDataset {
  readonly name: string;
  readonly description: string;
  readonly root: string;
  readonly fileCount: number;
  readonly totalBytes: number;
  readonly resourceBundles: readonly ContextPackResourceBundle[];
}

type DatasetDefinition = {
  readonly name: string;
  readonly description: string;
  readonly files: { readonly count: number; readonly bytesPerFile: number };
  readonly bundle?: { readonly name: string; readonly bytes: number };
};

const DATASET_DEFINITIONS: readonly DatasetDefinition[] = [
  {
    name: '10x1KB',
    description: 'Ten small documents sized at ~1KiB each.',
    files: { count: 10, bytesPerFile: 1024 },
  },
  {
    name: '100x10KB',
    description: 'One hundred medium documents sized at ~10KiB each.',
    files: { count: 100, bytesPerFile: 10 * 1024 },
  },
  {
    name: '500x100KB',
    description: 'Five hundred large documents sized at ~100KiB each.',
    files: { count: 500, bytesPerFile: 100 * 1024 },
    bundle: { name: 'reference-assets.tar', bytes: 256 * 1024 },
  },
];

const bufferCache = new Map<number, Buffer>();

function getBuffer(sizeInBytes: number): Buffer {
  const existing = bufferCache.get(sizeInBytes);
  if (existing) {
    return existing;
  }

  const buffer = Buffer.alloc(sizeInBytes, 'a');
  bufferCache.set(sizeInBytes, buffer);
  return buffer;
}

async function ensureFile(path: string, sizeInBytes: number): Promise<void> {
  try {
    await access(path, fsConstants.F_OK);
    return;
  } catch {
    // File does not exist and needs to be written.
  }

  await writeFile(path, getBuffer(sizeInBytes));
}

async function materializeDataset(baseDir: string, definition: DatasetDefinition): Promise<ContextPackDataset> {
  const datasetDir = join(baseDir, definition.name);
  await mkdir(datasetDir, { recursive: true });

  const fileWriteTasks: Promise<void>[] = [];

  for (let index = 0; index < definition.files.count; index += 1) {
    const filePath = join(datasetDir, `document-${index.toString().padStart(4, '0')}.txt`);
    fileWriteTasks.push(ensureFile(filePath, definition.files.bytesPerFile));
  }

  const resourceBundles: ContextPackResourceBundle[] = [];

  if (definition.bundle) {
    const bundleDir = join(baseDir, `${definition.name}-resources`);
    await mkdir(bundleDir, { recursive: true });
    const bundlePath = join(bundleDir, definition.bundle.name);
    fileWriteTasks.push(ensureFile(bundlePath, definition.bundle.bytes));
    resourceBundles.push({
      name: definition.bundle.name,
      path: bundlePath,
      bytes: definition.bundle.bytes,
    });
  }

  await Promise.all(fileWriteTasks);

  return {
    name: definition.name,
    description: definition.description,
    root: datasetDir,
    fileCount: definition.files.count,
    totalBytes: definition.files.count * definition.files.bytesPerFile,
    resourceBundles,
  };
}

export async function prepareContextPackDatasets(baseDir: string): Promise<ContextPackDataset[]> {
  const datasets = await Promise.all(DATASET_DEFINITIONS.map((definition) => materializeDataset(baseDir, definition)));
  return datasets;
}
