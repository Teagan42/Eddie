import { sep } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

type AsyncFactoryRegistration = (
  name: string,
  factory: () => unknown | Promise<unknown>,
) => void;
type AsyncBenchRegistration = (
  name: string,
  handler: () => unknown | Promise<unknown>,
) => void;

import type {
  TemplateRenderingFixture,
  TemplateRenderingMeasurement,
} from '../src/template-rendering.bench';
import {
  loadTemplateRenderingFixtures,
  measureTemplateRenderingScenario,
} from '../src/template-rendering.bench';

const templateFixturesPathSegment = `${sep}fixtures${sep}templates${sep}`;

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
    expect(welcomeFixture?.descriptor.file).toContain(
      templateFixturesPathSegment,
    );
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

  it('registers benchmark groups after fixtures are loaded', async () => {
    const suiteCallbacks: Array<() => unknown> = [];
    const describeCallbacks: Array<() => unknown> = [];
    const benchCallbacks: Array<() => unknown> = [];

    const registerSuite = vi.fn<AsyncFactoryRegistration>((name, factory) => {
      expect(name).toContain('TemplateRendererService');
      suiteCallbacks.push(factory);
    });
    const registerDescribe = vi.fn<AsyncFactoryRegistration>((name, factory) => {
      expect(name).toMatch(/inline|descriptor/);
      describeCallbacks.push(factory);
    });
    const registerBench = vi.fn<AsyncBenchRegistration>((name, handler) => {
      expect(name).toMatch(/inline|descriptor/);
      benchCallbacks.push(handler);
    });

    const { defineTemplateRenderingBenchmarks } = await import(
      '../src/template-rendering.bench'
    );

    await defineTemplateRenderingBenchmarks({
      suite: registerSuite,
      describe: registerDescribe,
      bench: registerBench,
      loadFixtures: loadTemplateRenderingFixtures,
    });

    expect(registerSuite).toHaveBeenCalled();
    expect(registerDescribe).not.toHaveBeenCalled();
    expect(registerBench).not.toHaveBeenCalled();

    for (const suiteFactory of suiteCallbacks) {
      await suiteFactory();
    }

    expect(registerDescribe).toHaveBeenCalled();

    for (const groupFactory of describeCallbacks) {
      await groupFactory();
    }

    expect(registerBench).toHaveBeenCalled();
    expect(benchCallbacks).not.toHaveLength(0);
  });
});
