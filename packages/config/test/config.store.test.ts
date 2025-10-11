import "reflect-metadata";

import fs from "fs/promises";
import os from "os";
import path from "path";
import { firstValueFrom } from "rxjs";
import { skip, take } from "rxjs/operators";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Test } from "@nestjs/testing";

import { ConfigModule } from "../src/config.module";
import { ConfigService } from "../src/config.service";
import { ConfigStore } from "../src/config.store";
import { DEFAULT_CONFIG } from "../src/defaults";
import { eddieConfig } from "../src/config.namespace";

describe("ConfigStore", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "config-store-"));
  });

  afterEach(async () => {
    delete process.env.CONFIG_ROOT;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("seeds the store with composed defaults during bootstrap", async () => {
    const defaults = structuredClone(DEFAULT_CONFIG);
    defaults.logging = {
      ...(defaults.logging ?? {}),
      level: "error",
    };

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.register({
        logLevel: defaults.logging?.level
      })],
    })
      .overrideProvider(eddieConfig.KEY)
      .useValue(defaults)
      .compile();
    // Trigger onApplicationBootstrap lifecycle hook
    await moduleRef.get(ConfigService).onApplicationBootstrap();
    const store = moduleRef.get(ConfigStore);

    expect(store.getSnapshot().logging?.level).toBe("error");

    await moduleRef.close();
  });

  it("applies CLI runtime overrides provided via module registration", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.registerAsync({
          useFactory: async () => ({ logLevel: "debug" as const }),
        }),
      ],
    }).compile();

    // Trigger onApplicationBootstrap lifecycle hook
    await moduleRef.get(ConfigService).onApplicationBootstrap();

    const store = moduleRef.get(ConfigStore);

    expect(store.getSnapshot().logLevel).toBe("debug");

    await moduleRef.close();
  });

  it("updates the snapshot when compose succeeds", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule],
    }).compile();
    // Trigger onApplicationBootstrap lifecycle hook
    await moduleRef.get(ConfigService).onApplicationBootstrap();
    const service = moduleRef.get(ConfigService);
    const store = moduleRef.get(ConfigStore);

    const next = await service.compose({ logLevel: "debug" });

    expect(store.getSnapshot()).toEqual(next);
    expect(store.getSnapshot().logLevel).toBe("debug");

    await moduleRef.close();
  });

  it("emits updates whenever configuration changes", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule],
    }).compile();
    // Trigger onApplicationBootstrap lifecycle hook
    await moduleRef.get(ConfigService).onApplicationBootstrap();
    const service = moduleRef.get(ConfigService);
    const store = moduleRef.get(ConfigStore);

    process.env.CONFIG_ROOT = tmpDir;

    const emissionPromise = firstValueFrom(
      store.changes$.pipe(skip(1), take(1))
    );

    await service.writeSource("logLevel: warn\n", "yaml");

    const emission = await emissionPromise;
    expect(emission.logLevel).toBe("warn");

    await moduleRef.close();
  });

  it("does not emit when setting an identical snapshot", () => {
    const store = new ConfigStore();

    let emissions = 0;
    const subscription = store.changes$.pipe(skip(1)).subscribe(() => {
      emissions += 1;
    });

    const snapshot = store.getSnapshot();
    store.setSnapshot(structuredClone(snapshot));

    expect(emissions).toBe(0);

    subscription.unsubscribe();
  });
});
