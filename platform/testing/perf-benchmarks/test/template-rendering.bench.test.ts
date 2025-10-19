import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';

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

  it('emits benchmark action entries for reporter consumption', async () => {
    const registry = await import('../src/benchmark-action.registry');
    const registerEntrySpy = vi.spyOn(registry, 'registerBenchmarkActionEntry');

    const moduleExports = (await import('../src/template-rendering.bench')) as Record<string, unknown>;
    const flushReport = moduleExports.emitTemplateRenderingBenchmarkReport as
      | (() => void)
      | undefined;

    expect(typeof flushReport).toBe('function');
    if (typeof flushReport !== 'function') {
      return;
    }

    const suiteCallbacks: Array<() => unknown> = [];
    const describeCallbacks: Array<() => unknown> = [];
    const benchCallbacks: Array<() => Promise<unknown>> = [];

    const registerSuite = vi.fn<AsyncFactoryRegistration>((_, factory) => {
      suiteCallbacks.push(factory);
    });
    const registerDescribe = vi.fn<AsyncFactoryRegistration>((_, factory) => {
      describeCallbacks.push(factory);
    });
    const registerBench = vi.fn<AsyncBenchRegistration>((_, handler) => {
      benchCallbacks.push(handler);
    });

    const { defineTemplateRenderingBenchmarks } = (await import(
      '../src/template-rendering.bench'
    )) as typeof import('../src/template-rendering.bench');

    await defineTemplateRenderingBenchmarks({
      suite: registerSuite,
      describe: registerDescribe,
      bench: registerBench,
      loadFixtures: loadTemplateRenderingFixtures,
    });

    for (const suiteFactory of suiteCallbacks) {
      await suiteFactory();
    }

    for (const describeFactory of describeCallbacks) {
      await describeFactory();
    }

    for (const benchHandler of benchCallbacks) {
      await benchHandler();
    }

    flushReport();

    expect(registerEntrySpy).toHaveBeenCalled();
  });

  it('writes structured reports to the benchmark action directory when configured', async () => {
    const reportRoot = mkdtempSync(join(tmpdir(), 'template-report-'));

    const moduleExports = (await import('../src/template-rendering.bench')) as Record<string, unknown>;
    const flushReport = moduleExports.emitTemplateRenderingBenchmarkReport as (() => void) | undefined;
    if (typeof flushReport !== 'function') {
      throw new Error('expected emitTemplateRenderingBenchmarkReport to be available');
    }

    const suiteCallbacks: Array<() => unknown> = [];
    const describeCallbacks: Array<() => unknown> = [];
    const benchCallbacks: Array<() => Promise<unknown>> = [];

    const registerSuite = vi.fn<AsyncFactoryRegistration>((_, factory) => {
      suiteCallbacks.push(factory);
    });
    const registerDescribe = vi.fn<AsyncFactoryRegistration>((_, factory) => {
      describeCallbacks.push(factory);
    });
    const registerBench = vi.fn<AsyncBenchRegistration>((_, handler) => {
      benchCallbacks.push(handler);
    });

    const { defineTemplateRenderingBenchmarks } = (await import(
      '../src/template-rendering.bench'
    )) as typeof import('../src/template-rendering.bench');

    process.env.BENCHMARK_ACTION_REPORT_DIR = reportRoot;

    await defineTemplateRenderingBenchmarks({
      suite: registerSuite,
      describe: registerDescribe,
      bench: registerBench,
      loadFixtures: loadTemplateRenderingFixtures,
    });

    for (const suiteFactory of suiteCallbacks) {
      await suiteFactory();
    }

    for (const describeFactory of describeCallbacks) {
      await describeFactory();
    }

    for (const benchHandler of benchCallbacks) {
      await benchHandler();
    }

    flushReport();

    const reportPath = join(reportRoot, 'template-rendering.nunjucks.json');
    const contents = readFileSync(reportPath, 'utf-8');
    const parsed = JSON.parse(contents) as { benchmark: string; scenarios: unknown[] };

    expect(parsed.benchmark).toBe('template-rendering.nunjucks');
    expect(Array.isArray(parsed.scenarios)).toBe(true);

    delete process.env.BENCHMARK_ACTION_REPORT_DIR;
  });
});
