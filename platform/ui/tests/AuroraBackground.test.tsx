import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import { AuroraBackground } from '../src/common/AuroraBackground';

describe('AuroraBackground', () => {
  it('renders multiple animated layers to intensify motion', () => {
    const { container } = render(<AuroraBackground />);
    const root = container.firstElementChild;

    expect(root).not.toBeNull();

    const animatedLayers = Array.from(root?.querySelectorAll('div') ?? []).filter((layer) =>
      layer.className.includes('animate-['),
    );

    expect(animatedLayers.length).toBeGreaterThanOrEqual(2);
    expect(animatedLayers.some((layer) => layer.className.includes('aurora-pulse'))).toBe(true);
  });
});
