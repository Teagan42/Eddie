import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

import { afterAll, bench, describe, suite } from 'vitest';
import knex, { type Knex } from 'knex';

import { KnexChatSessionsRepository } from '@eddie/api/src/chat-sessions/chat-sessions.repository';
import { ChatMessageRole } from '@eddie/api/src/chat-sessions/dto/create-chat-message.dto';

const BENCHMARK_NAME = 'chat-sessions.persistence';

export interface ChatSessionsPersistenceDriverInstance {
  readonly id: string;
  readonly label: string;
  readonly repository: KnexChatSessionsRepository;
  reset(): Promise<void>;
  dispose(): Promise<void>;
}

export interface ChatSessionsPersistenceDriver {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  setup(): Promise<ChatSessionsPersistenceDriverInstance>;
}

interface ChatSessionsScenarioOptions {
  readonly iterations?: number;
  readonly sessionCount?: number;
  readonly messagesPerSession?: number;
  readonly apiKeyPoolSize?: number;
}

interface OperationMetrics {
  readonly sampleCount: number;
  readonly avgLatencyMs: number;
  readonly opsPerSecond: number;
}

export interface ChatSessionsWorkflowMeasurement {
  readonly driverId: string;
  readonly driverLabel: string;
  readonly totals: {
    readonly sessionsCreated: number;
    readonly messagesPersisted: number;
    readonly apiKeysQueried: number;
  };
  readonly operations: {
    readonly createAndSeed: OperationMetrics;
    readonly listMessages: OperationMetrics;
    readonly listSessionsForApiKey: OperationMetrics;
  };
  readonly dataset: {
    readonly sessionIds: string[];
    readonly apiKeys: string[];
  };
}

const DEFAULT_SCENARIO: Required<ChatSessionsScenarioOptions> = {
  iterations: 1,
  sessionCount: 10,
  messagesPerSession: 100,
  apiKeyPoolSize: 10,
};

const CHAT_TABLES = [
  'tool_results',
  'tool_calls',
  'agent_invocations',
  'chat_messages',
  'chat_session_api_keys',
  'chat_sessions',
] as const;

const truncateChatTables = async (db: Knex): Promise<void> => {
  await db.transaction(async (trx) => {
    for (const table of CHAT_TABLES) {
      await trx(table).delete();
    }
  });
};

const initializeRepository = async (
  repository: KnexChatSessionsRepository,
): Promise<KnexChatSessionsRepository> => {
  await repository.listSessions();
  return repository;
};

const createSqliteDriver = (): ChatSessionsPersistenceDriver => {
  const id = 'sqlite';
  const label = 'SQLite (better-sqlite3)';
  return {
    id,
    label,
    description:
      'File-backed SQLite database using better-sqlite3. Useful for local benchmarking and deterministic runs.',
    async setup() {
      const directory = await mkdtemp(join(tmpdir(), 'eddie-chat-bench-sqlite-'));
      const filename = join(directory, 'chat.sqlite3');
      const database = knex({
        client: 'better-sqlite3',
        connection: { filename },
        useNullAsDefault: true,
      });
      const repository = await initializeRepository(
        new KnexChatSessionsRepository({
          knex: database,
          ownsConnection: true,
        }),
      );
      return {
        id,
        label,
        repository,
        async reset() {
          await truncateChatTables(database);
        },
        async dispose() {
          await repository.onModuleDestroy?.();
          await rm(directory, { recursive: true, force: true }).catch(() => undefined);
        },
      } satisfies ChatSessionsPersistenceDriverInstance;
    },
  } satisfies ChatSessionsPersistenceDriver;
};

interface SqlDriverConfig {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly client: 'pg' | 'mysql2';
  readonly connection: Knex.Config['connection'];
}

const createSqlDriver = (config: SqlDriverConfig): ChatSessionsPersistenceDriver => ({
  id: config.id,
  label: config.label,
  description: config.description,
  async setup() {
    const database = knex({
      client: config.client,
      connection: config.connection,
      pool: { min: 0, max: 10 },
    });
    const repository = await initializeRepository(
      new KnexChatSessionsRepository({
        knex: database,
        ownsConnection: true,
      }),
    );
    return {
      id: config.id,
      label: config.label,
      repository,
      async reset() {
        if (config.client === 'mysql2') {
          await database.raw('SET FOREIGN_KEY_CHECKS = 0');
          await truncateChatTables(database);
          await database.raw('SET FOREIGN_KEY_CHECKS = 1');
          return;
        }
        await truncateChatTables(database);
      },
      async dispose() {
        await repository.onModuleDestroy?.();
      },
    } satisfies ChatSessionsPersistenceDriverInstance;
  },
});

const resolvePostgresConnection = (): Knex.Config['connection'] | undefined => {
  const url =
    process.env.CHAT_SESSIONS_BENCH_POSTGRES_URL ??
    process.env.POSTGRES_URL ??
    process.env.DATABASE_URL ??
    undefined;
  return url;
};

const resolveMysqlConnection = (
  envKeys: readonly string[],
): Knex.Config['connection'] | undefined => {
  for (const key of envKeys) {
    const value = process.env[key];
    if (value) {
      return value;
    }
  }
  return undefined;
};

export async function loadChatSessionsPersistenceDrivers(): Promise<ChatSessionsPersistenceDriver[]> {
  const drivers: ChatSessionsPersistenceDriver[] = [createSqliteDriver()];

  const postgresConnection = resolvePostgresConnection();
  if (postgresConnection) {
    drivers.push(
      createSqlDriver({
        id: 'postgres',
        label: 'PostgreSQL (pg)',
        description:
          'Connects to a PostgreSQL service container to benchmark JSONB-backed persistence.',
        client: 'pg',
        connection: postgresConnection,
      }),
    );
  }

  const mysqlConnection = resolveMysqlConnection([
    'CHAT_SESSIONS_BENCH_MYSQL_URL',
    'MYSQL_URL',
  ]);
  if (mysqlConnection) {
    drivers.push(
      createSqlDriver({
        id: 'mysql',
        label: 'MySQL (mysql2)',
        description:
          'Connects to a MySQL service container to benchmark JSON column behaviour.',
        client: 'mysql2',
        connection: mysqlConnection,
      }),
    );
  }

  const mariadbConnection = resolveMysqlConnection([
    'CHAT_SESSIONS_BENCH_MARIADB_URL',
    'MARIADB_URL',
  ]);
  if (mariadbConnection) {
    drivers.push(
      createSqlDriver({
        id: 'mariadb',
        label: 'MariaDB (mysql2)',
        description:
          'Targets MariaDB deployments via the mysql2 driver for compatibility benchmarking.',
        client: 'mysql2',
        connection: mariadbConnection,
      }),
    );
  }

  return drivers;
}

const takeDuration = async <T>(
  samples: number[],
  operation: () => Promise<T>,
): Promise<T> => {
  const start = performance.now();
  try {
    return await operation();
  } finally {
    const end = performance.now();
    samples.push(Math.max(0, end - start));
  }
};

const summarizeDurations = (durations: number[]): OperationMetrics => {
  if (durations.length === 0) {
    return {
      sampleCount: 0,
      avgLatencyMs: 0,
      opsPerSecond: 0,
    } satisfies OperationMetrics;
  }

  const totalMs = durations.reduce((total, value) => total + value, 0);
  const avgLatencyMs = totalMs / durations.length;
  const opsPerSecond = totalMs === 0 ? 0 : durations.length / (totalMs / 1000);

  return {
    sampleCount: durations.length,
    avgLatencyMs,
    opsPerSecond,
  } satisfies OperationMetrics;
};

const createApiKeyPool = (size: number): string[] =>
  Array.from({ length: size }, (_, index) => `bench-api-key-${index + 1}`);

export async function measureChatSessionsPersistenceScenario(
  instance: ChatSessionsPersistenceDriverInstance,
  options: ChatSessionsScenarioOptions = {},
): Promise<ChatSessionsWorkflowMeasurement> {
  const config = { ...DEFAULT_SCENARIO, ...options } satisfies Required<ChatSessionsScenarioOptions>;
  const createDurations: number[] = [];
  const listMessagesDurations: number[] = [];
  const listSessionsDurations: number[] = [];

  let lastSessionIds: string[] = [];
  let lastApiKeys: string[] = [];

  for (let iteration = 0; iteration < config.iterations; iteration += 1) {
    const apiKeys = createApiKeyPool(config.apiKeyPoolSize);
    lastApiKeys = apiKeys;
    const sessionIds: string[] = [];

    for (let index = 0; index < config.sessionCount; index += 1) {
      const apiKey = apiKeys[index % apiKeys.length] ?? `bench-api-key-${index}`;
      const session = await takeDuration(createDurations, async () => {
        const created = await instance.repository.createSession({
          title: `Benchmark session ${iteration + 1}-${index + 1}`,
          description: `Simulated chat session ${index + 1} for persistence benchmark`,
          apiKey,
        });
        await instance.repository.appendMessage({
          sessionId: created.id,
          role: ChatMessageRole.User,
          content: `Hello from user in session ${index + 1}`,
        });
        return created;
      });

      sessionIds.push(session.id);

      for (let messageIndex = 1; messageIndex < config.messagesPerSession; messageIndex += 1) {
        const role = messageIndex % 2 === 0 ? ChatMessageRole.Assistant : ChatMessageRole.User;
        await instance.repository.appendMessage({
          sessionId: session.id,
          role,
          content: `Message ${messageIndex + 1} for session ${index + 1}`,
        });
      }
    }

    lastSessionIds = sessionIds;

    for (const sessionId of sessionIds) {
      await takeDuration(listMessagesDurations, async () =>
        instance.repository.listMessages(sessionId),
      );
    }

    for (const apiKey of apiKeys) {
      await takeDuration(listSessionsDurations, async () =>
        instance.repository.listSessionsForApiKey(apiKey),
      );
    }
  }

  const totals = {
    sessionsCreated: config.sessionCount * config.iterations,
    messagesPersisted: config.sessionCount * config.messagesPerSession * config.iterations,
    apiKeysQueried: config.apiKeyPoolSize * config.iterations,
  } as const;

  return {
    driverId: instance.id,
    driverLabel: instance.label,
    totals,
    operations: {
      createAndSeed: summarizeDurations(createDurations),
      listMessages: summarizeDurations(listMessagesDurations),
      listSessionsForApiKey: summarizeDurations(listSessionsDurations),
    },
    dataset: {
      sessionIds: lastSessionIds,
      apiKeys: lastApiKeys,
    },
  } satisfies ChatSessionsWorkflowMeasurement;
}

interface DriverSeries {
  readonly driverId: string;
  readonly driverLabel: string;
  readonly measurements: ChatSessionsWorkflowMeasurement[];
}

const measurementSeries = new Map<string, DriverSeries>();

const recordMeasurement = (measurement: ChatSessionsWorkflowMeasurement) => {
  const existing = measurementSeries.get(measurement.driverId);
  if (existing) {
    existing.measurements.push(measurement);
    return;
  }
  measurementSeries.set(measurement.driverId, {
    driverId: measurement.driverId,
    driverLabel: measurement.driverLabel,
    measurements: [measurement],
  });
};

type OperationKey = keyof ChatSessionsWorkflowMeasurement['operations'];

const summarizeOperationSeries = (
  series: DriverSeries,
  key: OperationKey,
) => {
  const samples = series.measurements.map((measurement) => measurement.operations[key]);
  if (samples.length === 0) {
    return {
      sampleCount: 0,
      meanLatencyMs: 0,
      meanOpsPerSecond: 0,
      minLatencyMs: 0,
      maxLatencyMs: 0,
    } as const;
  }

  const totalSamples = samples.reduce((total, item) => total + item.sampleCount, 0);
  const weightedLatency = samples.reduce(
    (total, item) => total + item.avgLatencyMs * item.sampleCount,
    0,
  );
  const meanLatencyMs = totalSamples === 0 ? 0 : weightedLatency / totalSamples;
  const meanOpsPerSecond =
    samples.reduce((total, item) => total + item.opsPerSecond, 0) / samples.length;
  const minLatencyMs = Math.min(...samples.map((item) => item.avgLatencyMs));
  const maxLatencyMs = Math.max(...samples.map((item) => item.avgLatencyMs));

  return {
    sampleCount: totalSamples,
    meanLatencyMs,
    meanOpsPerSecond,
    minLatencyMs,
    maxLatencyMs,
  } as const;
};

const aggregateTotals = (series: DriverSeries) =>
  series.measurements.reduce(
    (totals, measurement) => ({
      sessionsCreated: totals.sessionsCreated + measurement.totals.sessionsCreated,
      messagesPersisted:
        totals.messagesPersisted + measurement.totals.messagesPersisted,
      apiKeysQueried: totals.apiKeysQueried + measurement.totals.apiKeysQueried,
    }),
    { sessionsCreated: 0, messagesPersisted: 0, apiKeysQueried: 0 },
  );

const emitBenchmarkReport = () => {
  if (measurementSeries.size === 0) {
    return;
  }

  const drivers = Array.from(measurementSeries.values()).map((series) => ({
    id: series.driverId,
    label: series.driverLabel,
    samples: series.measurements.length,
    totals: aggregateTotals(series),
    operations: {
      createAndSeed: summarizeOperationSeries(series, 'createAndSeed'),
      listMessages: summarizeOperationSeries(series, 'listMessages'),
      listSessionsForApiKey: summarizeOperationSeries(
        series,
        'listSessionsForApiKey',
      ),
    },
  }));

  const report = {
    benchmark: BENCHMARK_NAME,
    environment: {
      node: process.version,
      commit: process.env.GITHUB_SHA,
    },
    guidance:
      'Compare opsPerSecond to gauge throughput and avgLatencyMs for per-request cost. Differences between drivers highlight JSON storage strategies and transaction overhead.',
    drivers,
  };

  console.log(JSON.stringify(report));
};

interface ChatSessionsBenchmarkRegistrationContext {
  readonly suite: typeof suite;
  readonly describe: typeof describe;
  readonly bench: typeof bench;
  readonly loadDrivers?: () => Promise<ChatSessionsPersistenceDriver[]>;
  readonly measureScenario?: (
    instance: ChatSessionsPersistenceDriverInstance,
    options?: ChatSessionsScenarioOptions,
  ) => Promise<ChatSessionsWorkflowMeasurement>;
  readonly scenarioOptions?: ChatSessionsScenarioOptions;
}

const DEFAULT_BENCH_OPTIONS: ChatSessionsScenarioOptions = {
  iterations: 1,
  sessionCount: 25,
  messagesPerSession: 40,
  apiKeyPoolSize: 10,
};

export async function defineChatSessionsPersistenceBenchmarks({
  suite: registerSuite,
  describe: registerDescribe,
  bench: registerBench,
  loadDrivers: loadDriversFn = loadChatSessionsPersistenceDrivers,
  measureScenario: measureScenarioFn = measureChatSessionsPersistenceScenario,
  scenarioOptions = DEFAULT_BENCH_OPTIONS,
}: ChatSessionsBenchmarkRegistrationContext): Promise<void> {
  const drivers = await loadDriversFn();

  registerSuite('Chat session persistence workflows', () => {
    afterAll(() => {
      emitBenchmarkReport();
    });

    for (const driver of drivers) {
      const groupName = `${driver.label} (${driver.id})`;
      const benchName = `${driver.id} throughput`;
      registerDescribe(groupName, () => {
        registerBench(benchName, async () => {
          let instance: ChatSessionsPersistenceDriverInstance | undefined;
          try {
            instance = await driver.setup();
          } catch (error) {
            console.warn(
              `Skipping chat session persistence driver "${driver.id}" after setup failure.`,
              error,
            );
            return;
          }
          try {
            await instance.reset();
            const measurement = await measureScenarioFn(instance, scenarioOptions);
            recordMeasurement(measurement);
          } finally {
            await instance?.dispose();
          }
        });
      });
    }
  });
}

if (process.env.MARIADB_URL || process.env.MYSQL_URL || process.env.POSTGRES_URL || true) {
  await defineChatSessionsPersistenceBenchmarks({
    suite,
    describe,
    bench,
    loadDrivers: loadChatSessionsPersistenceDrivers,
    measureScenario: measureChatSessionsPersistenceScenario,
    scenarioOptions: DEFAULT_BENCH_OPTIONS,
  }).catch((error) => {
    console.error('Failed to register chat session persistence benchmarks', error);
  });
}


