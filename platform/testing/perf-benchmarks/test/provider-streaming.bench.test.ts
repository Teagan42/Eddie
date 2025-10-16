import { describe, expect, it } from 'vitest';

import type {
  ProviderStreamFixture,
  ProviderStreamMeasurement,
} from '../src/provider-streaming.bench';
import {
  loadProviderStreamFixtures,
  measureProviderStreamScenario,
} from '../src/provider-streaming.bench';

const expectedFixtureIds = [
  'simple-completion',
  'heavy-tool-loop',
  'mixed-notifications',
];

const createDeterministicClock = (increments: number[]) => {
  let cursor = 0;
  let time = 0;
  return () => {
    const increment =
      increments[cursor] ?? increments[increments.length - 1] ?? 0;
    cursor += 1;
    time += increment;
    return time;
  };
};

describe('provider-streaming benchmarks', () => {
  it('loads provider stream fixtures with expected identifiers', async () => {
    const fixtures = await loadProviderStreamFixtures();
    const ids = fixtures.map((fixture) => fixture.id).sort();
    expect(ids).toEqual([...expectedFixtureIds].sort());
  });

  it('measures cold and warm stream iterations using recorded fixtures', async () => {
    const fixtures = await loadProviderStreamFixtures();

    const measurementPromises = fixtures.map(
      async (fixture): Promise<ProviderStreamMeasurement> => {
        const clock = createDeterministicClock([5, 2, 2, 1]);
        return measureProviderStreamScenario(fixture, { clock });
      },
    );

    const measurements = await Promise.all(measurementPromises);

    for (let index = 0; index < fixtures.length; index += 1) {
      const fixture: ProviderStreamFixture = fixtures[index]!;
      const measurement = measurements[index]!;

      expect(measurement.fixtureId).toBe(fixture.id);
      expect(measurement.coldStart.events).toEqual(
        fixture.expectations.streamEvents,
      );
      expect(measurement.warmStream.events).toEqual(
        fixture.expectations.streamEvents,
      );
      expect(measurement.coldStart.durationMs).toBeGreaterThan(0);
      expect(measurement.warmStream.durationMs).toBeGreaterThan(0);
    }
  });
});
