import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/react';
import { KeyRound } from 'lucide-react';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';

import { EddieButton, EddieIcon } from '../src';

describe('EddieIcon', () => {
  it('renders the provided icon with hero console styling', () => {
    const { container } = render(createElement(EddieIcon, { icon: KeyRound }));

    const wrapper = container.firstElementChild as HTMLElement | null;
    const svg = wrapper?.querySelector('svg');

    expect(wrapper).not.toBeNull();
    expect(wrapper?.className).toContain('bg-[color:var(--hero-console-icon-bg)]');
    expect(wrapper?.className).toContain('flex');
    expect(svg).not.toBeNull();
    expect(svg?.className.baseVal ?? svg?.className).toContain('h-6 w-6');
    expect(svg?.className.baseVal ?? svg?.className).toContain(
      'text-[color:var(--hero-console-icon-fg)]'
    );
  });
});

describe('EddieButton', () => {
  it('applies the gradient call-to-action styling to its child', () => {
    const child = createElement('a', { href: '#', children: 'Launch' });
    const { getByText } = render(createElement(EddieButton, { children: child }));

    const link = getByText('Launch');

    expect(link.className).toContain('bg-gradient-to-r');
    expect(link.className).toContain('from-[hsl(var(--hero-cta-from))]');
    expect(link.className).toContain('dark:shadow-[var(--hero-cta-shadow-dark)]');
  });
});

describe('module entry points', () => {
  it('exposes EddieButton via a TitleCase component path', async () => {
    const module = await import('../src/components/EddieButton');

    expect(module.EddieButton).toBeTypeOf('function');
  });

  it('exposes EddieIcon via a TitleCase component path', async () => {
    const module = await import('../src/components/EddieIcon');

    expect(module.EddieIcon).toBeTypeOf('function');
  });
});
