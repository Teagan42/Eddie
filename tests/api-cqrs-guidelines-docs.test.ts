import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const docPath = join(process.cwd(), 'docs', 'migration', 'api-cqrs-guidelines.md');

const requiredHeadings = [
  '# API CQRS Guidelines',
  '## Handler naming',
  '## Directory layout',
  '## Testing expectations',
];

describe('api cqrs guidelines documentation', () => {
  it('documents handler naming, directory layout, and testing expectations', () => {
    const content = readFileSync(docPath, 'utf8');

    requiredHeadings.forEach((heading) => {
      expect(content).toContain(heading);
    });
  });
});
