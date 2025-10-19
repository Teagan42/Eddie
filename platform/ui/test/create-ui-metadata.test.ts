import { describe, expect, it } from 'vitest';
import { createUiMetadata, UI_PACKAGE_NAME } from '../src';

describe('createUiMetadata', () => {
  it('returns a new metadata object copy', () => {
    const input = { surface: 'web', version: '1.2.3' } as const;
    const clone = { ...input };

    const result = createUiMetadata(clone);

    expect(result).toEqual(input);
    expect(result).not.toBe(clone);
  });
});

describe('UI package metadata constants', () => {
  it('exposes the scoped package identifier', () => {
    expect(UI_PACKAGE_NAME).toBe('@eddie/ui');
  });
});
