import { afterAll, describe, expect, it, vi } from 'vitest';

import type {
  ChatSessionsPersistenceDriverInstance,
  ChatSessionsWorkflowMeasurement,
} from '../src/chat-sessions-persistence.bench';
import {
  defineChatSessionsPersistenceBenchmarks,
  loadChatSessionsPersistenceDrivers,
  measureChatSessionsPersistenceScenario,
} from '../src/chat-sessions-persistence.bench';

describe('chat-sessions persistence benchmarks', () => {
  let activeInstance: ChatSessionsPersistenceDriverInstance | undefined;

  afterAll(async () => {
    if (activeInstance) {
      await activeInstance.dispose();
      activeInstance = undefined;
    }
  });

  it('provides a sqlite driver when no external services are configured', async () => {
    const drivers = await loadChatSessionsPersistenceDrivers();
    const sqlite = drivers.find((driver) => driver.id === 'sqlite');
    expect(sqlite).toBeDefined();
  });

  it('measures representative workflows against the sqlite driver', { timeout: 15000 }, async () => {
    const drivers = await loadChatSessionsPersistenceDrivers();
    const sqlite = drivers.find((driver) => driver.id === 'sqlite');
    if (!sqlite) {
      throw new Error('expected sqlite driver to be available');
    }

    activeInstance = await sqlite.setup();
    await activeInstance.reset();

    const measurement = await measureChatSessionsPersistenceScenario(
      activeInstance,
      {
        sessionCount: 2,
        messagesPerSession: 5,
        apiKeyPoolSize: 3,
        iterations: 1,
      },
    );

    expect(measurement.driverId).toBe('sqlite');
    expect(measurement.operations.createAndSeed.sampleCount).toBeGreaterThanOrEqual(
      2,
    );
    expect(measurement.operations.listMessages.sampleCount).toBeGreaterThanOrEqual(2);
    expect(
      measurement.operations.listSessionsForApiKey.sampleCount,
    ).toBeGreaterThanOrEqual(3);
    expect(measurement.operations.createAndSeed.opsPerSecond).toBeGreaterThan(0);
    expect(measurement.operations.listMessages.opsPerSecond).toBeGreaterThan(0);

    const sessions = await activeInstance.repository.listSessions();
    expect(sessions).toHaveLength(2);

    const [firstSession] = sessions;
    if (!firstSession) {
      throw new Error('expected at least one session to be created');
    }

    const messages = await activeInstance.repository.listMessages(firstSession.id);
    expect(messages).toHaveLength(5);

    const [firstApiKey] = measurement.dataset.apiKeys;
    if (!firstApiKey) {
      throw new Error('expected measurement to include api keys');
    }

    const sessionsForKey = await activeInstance.repository.listSessionsForApiKey(
      firstApiKey,
    );
    expect(sessionsForKey.length).toBeGreaterThan(0);
  });

  it('registers benchmark suites per driver when invoked under vitest bench mode', async () => {
    const dispose = vi.fn();
    const reset = vi.fn();

    const instance: ChatSessionsPersistenceDriverInstance = {
      id: 'stub',
      label: 'Stub driver',
      repository: {} as ChatSessionsPersistenceDriverInstance['repository'],
      reset,
      dispose,
    };

    const setup = vi.fn(async () => instance);

    const drivers = [
      {
        id: 'stub',
        label: 'Stub driver',
        description: 'Used for registration flow assertions',
        setup,
      },
    ];

    const measurement: ChatSessionsWorkflowMeasurement = {
      driverId: 'stub',
      driverLabel: 'Stub driver',
      totals: {
        sessionsCreated: 1,
        messagesPersisted: 1,
        apiKeysQueried: 1,
      },
      operations: {
        createAndSeed: {
          sampleCount: 1,
          avgLatencyMs: 1,
          opsPerSecond: 1,
        },
        listMessages: {
          sampleCount: 1,
          avgLatencyMs: 1,
          opsPerSecond: 1,
        },
        listSessionsForApiKey: {
          sampleCount: 1,
          avgLatencyMs: 1,
          opsPerSecond: 1,
        },
      },
      dataset: {
        sessionIds: [],
        apiKeys: [],
      },
    };

    const measureScenario = vi.fn().mockResolvedValue(measurement);

    const suiteCallbacks: Array<() => unknown> = [];
    const describeCallbacks: Array<() => unknown> = [];
    const benchCallbacks: Array<() => unknown> = [];

    const registerSuite = vi.fn((name: string, factory: () => unknown) => {
      suiteCallbacks.push(factory);
      expect(name).toContain('Chat session persistence');
    });
    const registerDescribe = vi.fn((name: string, factory: () => unknown) => {
      describeCallbacks.push(factory);
      expect(name).toContain('Stub driver');
    });
    const registerBench = vi.fn((name: string, handler: () => unknown) => {
      benchCallbacks.push(handler);
      expect(name).toContain('stub');
    });

    await defineChatSessionsPersistenceBenchmarks({
      suite: registerSuite,
      describe: registerDescribe,
      bench: registerBench,
      loadDrivers: async () => drivers,
      measureScenario,
    });

    expect(registerSuite).toHaveBeenCalledTimes(1);
    expect(registerDescribe).not.toHaveBeenCalled();
    expect(registerBench).not.toHaveBeenCalled();

    for (const suiteFactory of suiteCallbacks) {
      await suiteFactory();
    }

    expect(registerDescribe).toHaveBeenCalledTimes(1);

    for (const describeFactory of describeCallbacks) {
      await describeFactory();
    }

    expect(registerBench).toHaveBeenCalledTimes(1);

    const [handler] = benchCallbacks;
    if (!handler) {
      throw new Error('expected bench handler to be registered');
    }

    await handler();

    expect(setup).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);
    expect(measureScenario).toHaveBeenCalledWith(instance, expect.any(Object));
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('skips drivers whose setup fails by logging a warning', async () => {
    const error = new Error('failed to connect');
    const setup = vi.fn(async () => {
      throw error;
    });

    const drivers = [
      {
        id: 'stub',
        label: 'Stub driver',
        description: 'Used for failure flow assertions',
        setup,
      },
    ];

    const measureScenario = vi.fn();

    const suiteCallbacks: Array<() => unknown> = [];
    const describeCallbacks: Array<() => unknown> = [];
    const benchCallbacks: Array<() => unknown> = [];

    const registerSuite = vi.fn((name: string, factory: () => unknown) => {
      suiteCallbacks.push(factory);
      expect(name).toContain('Chat session persistence');
    });
    const registerDescribe = vi.fn((name: string, factory: () => unknown) => {
      describeCallbacks.push(factory);
      expect(name).toContain('Stub driver');
    });
    const registerBench = vi.fn((name: string, handler: () => unknown) => {
      benchCallbacks.push(handler);
      expect(name).toContain('stub');
    });

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await defineChatSessionsPersistenceBenchmarks({
      suite: registerSuite,
      describe: registerDescribe,
      bench: registerBench,
      loadDrivers: async () => drivers,
      measureScenario,
    });

    expect(registerSuite).toHaveBeenCalledTimes(1);
    expect(suiteCallbacks).toHaveLength(1);

    const [suiteFactory] = suiteCallbacks;
    if (!suiteFactory) {
      throw new Error('expected suite factory to be registered');
    }

    await suiteFactory();

    expect(describeCallbacks).toHaveLength(1);

    for (const factory of describeCallbacks) {
      await factory?.();
    }

    expect(benchCallbacks).toHaveLength(1);

    const [benchHandler] = benchCallbacks;
    if (!benchHandler) {
      throw new Error('expected bench handler to be registered');
    }

    await expect(benchHandler()).resolves.toBeUndefined();

    expect(setup).toHaveBeenCalledTimes(1);
    expect(measureScenario).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      'Skipping chat session persistence driver "stub" after setup failure.',
      error,
    );

    warn.mockRestore();
  });
});
