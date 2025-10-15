import 'reflect-metadata';
import knex, { type Knex } from 'knex';
import { vi } from 'vitest';
import { MODULE_METADATA } from '@nestjs/common/constants';
import type { Provider } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { ConfigStore } from '@eddie/config';
import { StreamRendererService } from '@eddie/io';

import { ChatSessionsModule } from '../../../src/chat-sessions/chat-sessions.module';
import { chatSessionCommandHandlers } from '../../../src/chat-sessions/commands';
import { chatSessionQueryHandlers } from '../../../src/chat-sessions/queries';
import { DatabaseModule } from '../../../src/persistence/database.module';
import { KNEX_INSTANCE } from '../../../src/persistence/knex.provider';
import {
  CHAT_SESSIONS_REPOSITORY,
  InMemoryChatSessionsRepository,
  KnexChatSessionsRepository,
} from '../../../src/chat-sessions/chat-sessions.repository';
import { ChatSessionStreamRendererService } from '../../../src/chat-sessions/chat-session-stream-renderer.service';

describe('ChatSessionsModule', () => {
  const getImports = () =>
    (Reflect.getMetadata(MODULE_METADATA.IMPORTS, ChatSessionsModule) ?? []) as unknown[];
  const getProviders = () =>
    (Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      ChatSessionsModule,
    ) ?? []) as Provider[];
  const getRepositoryProvider = () =>
    getProviders().find(
      (provider): provider is Exclude<Provider, Function> & { provide: unknown; useFactory: Function } =>
        typeof provider === 'object' &&
        provider !== null &&
        'provide' in provider &&
        provider.provide === CHAT_SESSIONS_REPOSITORY,
    )!;
  const createConfigStore = (snapshot: unknown): ConfigStore =>
    ({ getSnapshot: () => snapshot } as unknown as ConfigStore);
  const createKnexStub = (client: string): Knex =>
    ({
      schema: {
        hasTable: vi.fn().mockResolvedValue(true),
        createTable: vi.fn(),
      },
      client: { config: { client } },
      destroy: vi.fn(),
    } as unknown as Knex);
  const createModuleRef = (knexInstance: Knex | undefined): ModuleRef =>
    ({
      get: vi.fn().mockReturnValue(knexInstance),
    } as unknown as ModuleRef);

  it('imports the CQRS module without registering event payloads as providers', () => {
    const imports = getImports();
    const providers =
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, ChatSessionsModule) ?? [];

    const importNames = imports.map((moduleRef: unknown) =>
      typeof moduleRef === 'function' ? moduleRef.name : undefined,
    );
    expect(importNames).toEqual(expect.arrayContaining(['CqrsModule']));
    const providerClassNames = providers
      .filter((provider: unknown): provider is Function => typeof provider === 'function')
      .map((provider) => provider.name);

    expect(providerClassNames).toEqual(
      expect.not.arrayContaining([
        'ChatSessionCreatedEvent',
        'ChatSessionUpdatedEvent',
        'ChatMessageCreatedEvent',
      ]),
    );
  });

  it('registers CQRS command and query handlers as providers', () => {
    const providerClassNames = getProviders()
      .filter((provider: unknown): provider is Function => typeof provider === 'function')
      .map((provider) => provider.name);

    for (const handler of [...chatSessionCommandHandlers, ...chatSessionQueryHandlers]) {
      expect(providerClassNames).toContain(handler.name);
    }
  });

  it('imports the DatabaseModule to expose shared persistence providers', () => {
    const imports = getImports();

    expect(imports).toEqual(expect.arrayContaining([DatabaseModule]));
  });

  it('injects the config store and module reference for the repository provider', () => {
    const provider = getRepositoryProvider();

    expect(provider.inject).toEqual([ConfigStore, ModuleRef]);
  });

  it('returns an in-memory repository when the persistence driver is memory', () => {
    const provider = getRepositoryProvider();
    const moduleRef = createModuleRef(undefined);
    const repository = provider.useFactory(
      createConfigStore({
        api: { persistence: { driver: 'memory' } },
      }),
      moduleRef,
    );

    expect(repository).toBeInstanceOf(InMemoryChatSessionsRepository);
    expect(moduleRef.get).not.toHaveBeenCalled();
  });

  it('uses the shared knex instance for sqlite persistence', async () => {
    const provider = getRepositoryProvider();
    const configStore = createConfigStore({
      api: { persistence: { driver: 'sqlite', sqlite: { filename: ':memory:' } } },
    });
    const database = knex({
      client: 'better-sqlite3',
      connection: { filename: ':memory:' },
      useNullAsDefault: true,
    });
    const destroySpy = vi.spyOn(database, 'destroy');
    const moduleRef = createModuleRef(database);

    try {
      const repository = provider.useFactory(configStore, moduleRef);

      expect(repository).toBeInstanceOf(KnexChatSessionsRepository);
      await expect(repository.listSessions()).resolves.toEqual([]);
      await expect(repository.onModuleDestroy()).resolves.toBeUndefined();
      expect(destroySpy).not.toHaveBeenCalled();
      expect(moduleRef.get).toHaveBeenCalledWith(KNEX_INSTANCE, { strict: false });
    } finally {
      await database.destroy();
    }
  });

  it('supports other sql drivers by using the shared knex instance', () => {
    const provider = getRepositoryProvider();
    const knexInstance = createKnexStub('pg');
    const moduleRef = createModuleRef(knexInstance);
    const repository = provider.useFactory(
      createConfigStore({
        api: { persistence: { driver: 'postgres', postgres: { connection: {} } } },
      }),
      moduleRef,
    );

    expect(repository).toBeInstanceOf(KnexChatSessionsRepository);
    expect(moduleRef.get).toHaveBeenCalledWith(KNEX_INSTANCE, { strict: false });
  });

  it('throws a descriptive error for unknown drivers', () => {
    const provider = getRepositoryProvider();
    const moduleRef = createModuleRef(undefined);

    expect(() =>
      provider.useFactory(
        createConfigStore({
          api: { persistence: { driver: 'oracle' } },
        }),
        moduleRef,
      ),
    ).toThrowError(
      'Unsupported chat sessions persistence driver "oracle". Supported drivers: memory, sqlite, postgres, mysql, mariadb.',
    );
    expect(moduleRef.get).not.toHaveBeenCalled();
  });

  it('provides the chat session stream renderer to engine consumers', () => {
    const providers = getProviders();

    expect(providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provide: StreamRendererService,
          useClass: ChatSessionStreamRendererService,
        }),
        expect.objectContaining({
          provide: ChatSessionStreamRendererService,
          useExisting: StreamRendererService,
        }),
      ]),
    );
  });
});
