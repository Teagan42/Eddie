import { describe, expect, it } from 'vitest';

import type {
  TemplateRenderingFixture,
  TemplateRenderingMeasurement,
} from '../src/template-rendering.bench';
import {
  loadTemplateRenderingFixtures,
  measureTemplateRenderingScenario,
} from '../src/template-rendering.bench';

describe('template-rendering benchmarks', () => {
  it('prepares fixtures that exercise extends and include behaviour', async () => {
    const fixtures = await loadTemplateRenderingFixtures();

    const ids = fixtures.map((fixture) => fixture.id);
    expect(ids).toContain('welcome-email');

    const welcomeFixture = fixtures.find(
      (fixture) => fixture.id === 'welcome-email',
    ) as TemplateRenderingFixture | undefined;

    expect(welcomeFixture).toBeDefined();
    expect(welcomeFixture?.inline.template).toContain('{% extends');
    expect(welcomeFixture?.inline.template).toContain('{% include');
    expect(welcomeFixture?.descriptor.file).toMatch(/welcome-email\.njk$/);
  });

  it('measures cold, warm, and cache-busted renders for a fixture', async () => {
    const [fixture] = await loadTemplateRenderingFixtures();

    const increments = [5, 3, 2, 1, 4, 2];
    let cursor = 0;
    let time = 0;
    const measurement = (await measureTemplateRenderingScenario(fixture, {
      clock: () => {
        const increment = increments[cursor] ?? 0;
        cursor += 1;
        time += increment;
        return time;
      },
    })) as TemplateRenderingMeasurement;

    expect(measurement.fixtureId).toBe(fixture.id);
    expect(measurement.cold.rendered).toBeTruthy();
    expect(measurement.warm.rendered).toBe(measurement.cold.rendered);
    expect(measurement.cacheBusted.rendered).toBe(measurement.cold.rendered);

    expect(measurement.cold.durationMs).toBeGreaterThan(0);
    expect(measurement.warm.durationMs).toBeGreaterThan(0);
    expect(measurement.cacheBusted.durationMs).toBeGreaterThanOrEqual(0);
  });
});
