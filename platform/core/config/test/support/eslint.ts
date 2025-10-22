import { ESLint } from 'eslint';
import fs from 'node:fs/promises';
import path from 'node:path';

const packageRoot = path.resolve(__dirname, '..', '..');
let cachedEslint: ESLint | null = null;

async function getEslint(): Promise<ESLint> {
  if (!cachedEslint) {
    cachedEslint = new ESLint({
      cwd: packageRoot,
      cache: true,
      cacheLocation: path.join(packageRoot, '.vitest-eslint-cache'),
    });
  }

  return cachedEslint;
}

export async function lintFile(relativePath: string): Promise<ESLint.LintResult> {
  const eslint = await getEslint();
  const absolutePath = path.resolve(packageRoot, relativePath);
  const fileText = await fs.readFile(absolutePath, 'utf8');
  const [result] = await eslint.lintText(fileText, { filePath: absolutePath });

  if (!result) {
    throw new Error(`No lint result produced for ${relativePath}`);
  }

  return result;
}
