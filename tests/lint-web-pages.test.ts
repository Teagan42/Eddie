import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const projectRoot = resolve(__dirname, '..');
const eslintBin = resolve(projectRoot, 'node_modules/.bin/eslint');
const webConfig = resolve(projectRoot, 'apps/web/eslint.config.cjs');

function lintWebPages(): void {
  execFileSync(eslintBin, ['--config', webConfig, '--max-warnings=0', 'apps/web/src/pages'], {
    cwd: projectRoot,
    stdio: 'pipe',
  });
}

describe('lint:web', () => {
  it('lints web pages without errors', () => {
    expect(() => {
      lintWebPages();
    }).not.toThrow();
  });
});
