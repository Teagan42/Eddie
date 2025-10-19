import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export const read = (relative: string) => readFileSync(join(repoRoot, relative), 'utf8');

export const readJson = <T>(relative: string): T => {
  const contents = read(relative);
  return JSON.parse(contents) as T;
};
