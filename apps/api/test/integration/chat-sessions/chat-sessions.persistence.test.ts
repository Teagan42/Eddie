import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Test } from "@nestjs/testing";
import {
  ConfigService,
  ConfigStore,
  DEFAULT_CONFIG,
} from "@eddie/config";
import type { ApiPersistenceConfig } from "@eddie/config";

import { ChatSessionsService } from "../../../src/chat-sessions/chat-sessions.service";
import { CHAT_SESSIONS_REPOSITORY_PROVIDER } from "../../../src/chat-sessions/chat-sessions.module";
import { ChatMessageRole } from "../../../src/chat-sessions/dto/create-chat-message.dto";

const createTempFilename = (): string => {
  const directory = mkdtempSync(path.join(tmpdir(), "eddie-chat-sessions-"));
  return path.join(directory, "chat.sqlite");
};

describe("ChatSessionsRepository persistence", () => {
  let filename: string;
  const createdDirs: string[] = [];

  beforeEach(() => {
    filename = createTempFilename();
    createdDirs.push(path.dirname(filename));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(() => {
    for (const dir of createdDirs) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup failures in CI environments
      }
    }
  });

  const buildTestingModule = async () => {
    const config = structuredClone(DEFAULT_CONFIG);
    config.api = {
      ...(config.api ?? {}),
      persistence: {
        driver: "sqlite",
        sqlite: { filename },
      },
    };

    const load = vi.fn().mockResolvedValue(config);
    const getSnapshot = vi.fn().mockReturnValue(config);
    const moduleRef = await Test.createTestingModule({
      providers: [
        { provide: ConfigService, useValue: { load } },
        { provide: ConfigStore, useValue: { getSnapshot } },
        CHAT_SESSIONS_REPOSITORY_PROVIDER,
        ChatSessionsService,
      ],
    }).compile();

    return { moduleRef };
  };

  it("persists messages to disk across service lifecycles", async () => {
    const first = await buildTestingModule();
    const firstService = first.moduleRef.get(ChatSessionsService);

    const session = await firstService.createSession({ title: "Persisted" });
    await firstService.addMessage(session.id, {
      role: ChatMessageRole.User,
      content: "Hello",
    });

    await first.moduleRef.close();

    const second = await buildTestingModule();
    const secondService = second.moduleRef.get(ChatSessionsService);

    const messages = await secondService.listMessages(session.id);

    expect(messages).toHaveLength(1);
    expect(messages[0]?.content).toBe("Hello");

    await second.moduleRef.close();
  });

  it("throws when configured with an unsupported persistence driver", async () => {
    const config = structuredClone(DEFAULT_CONFIG);
    config.api = {
      ...(config.api ?? {}),
      persistence: {
        driver: "postgres",
      },
    };

    const load = vi.fn().mockResolvedValue(config);
    const getSnapshot = vi.fn().mockReturnValue(config);

    const module = Test.createTestingModule({
      providers: [
        { provide: ConfigService, useValue: { load } },
        { provide: ConfigStore, useValue: { getSnapshot } },
        CHAT_SESSIONS_REPOSITORY_PROVIDER,
        ChatSessionsService,
      ],
    });

    await expect(module.compile()).rejects.toThrow(
      'Unsupported chat sessions persistence driver "postgres". Supported drivers: memory, sqlite. Set "api.persistence.driver" to either "memory" or "sqlite".'
    );
  });

  it("throws when configured with an unknown persistence driver string", async () => {
    const config = structuredClone(DEFAULT_CONFIG);
    const persistence = {
      driver: "cockroach",
    } as unknown as ApiPersistenceConfig;
    config.api = {
      ...(config.api ?? {}),
      persistence,
    };

    const load = vi.fn().mockResolvedValue(config);
    const getSnapshot = vi.fn().mockReturnValue(config);

    const module = Test.createTestingModule({
      providers: [
        { provide: ConfigService, useValue: { load } },
        { provide: ConfigStore, useValue: { getSnapshot } },
        CHAT_SESSIONS_REPOSITORY_PROVIDER,
        ChatSessionsService,
      ],
    });

    await expect(module.compile()).rejects.toThrow(
      'Unsupported chat sessions persistence driver "cockroach". Supported drivers: memory, sqlite. Set "api.persistence.driver" to either "memory" or "sqlite".'
    );
  });
});
