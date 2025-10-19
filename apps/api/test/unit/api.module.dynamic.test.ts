import type { CliRuntimeOptions } from "@eddie/config";
import { ConfigModule } from "@eddie/config";
import type { DynamicModule } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("ApiModule configuration", () => {
  const collectProviderTokens = (providers: unknown[]): unknown[] =>
    providers.map((provider) => {
      if (typeof provider === "function") {
        return provider;
      }
      if (provider && typeof provider === "object") {
        return (provider as { provide?: unknown }).provide ?? provider;
      }
      return provider;
    });

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it(
    "forRoot includes ConfigModule registration with runtime options",
    { timeout: 10000 },
    async () => {
      const { ConfigModule } = await import("@eddie/config");
      const registerSpy = vi.spyOn(ConfigModule, "register");
      const registrationResult = { module: class {} } as DynamicModule;
      registerSpy.mockReturnValue(
        registrationResult as ReturnType<ConfigModule["register"]>,
      );

      const cliOverrides: CliRuntimeOptions = {
        logLevel: "debug",
      };

      const { ApiModule } = await import("../../src/api.module");

      const dynamicModule = (ApiModule as unknown as {
        forRoot: (options: CliRuntimeOptions) => DynamicModule;
      }).forRoot(cliOverrides);

      expect(registerSpy).toHaveBeenCalledWith(cliOverrides);
      expect(dynamicModule.imports).toContain(registrationResult);
    }
  );

  it("forRootAsync forwards async registration options to ConfigModule.registerAsync", async () => {
    const { ConfigModule } = await import("@eddie/config");
    const registerAsyncSpy = vi.spyOn(ConfigModule, "registerAsync");
    const registrationResult = { module: class {} } as DynamicModule;
    registerAsyncSpy.mockReturnValue(
      registrationResult as ReturnType<typeof ConfigModule.registerAsync>,
    );

    const asyncOptions = {
      useFactory: () => ({ logLevel: "info" }),
      inject: [],
    } as Parameters<typeof ConfigModule.registerAsync>[0];

    const { ApiModule } = await import("../../src/api.module");

    const dynamicModule = (ApiModule as unknown as {
      forRootAsync: (
        options: Parameters<typeof ConfigModule.registerAsync>[0]
      ) => DynamicModule;
    }).forRootAsync(asyncOptions);

    expect(registerAsyncSpy).toHaveBeenCalledWith(asyncOptions);
    expect(dynamicModule.imports).toContain(registrationResult);
  });

  it("exposes MCP tooling without requiring direct SDK resolution", async () => {
    await expect(import("@eddie/mcp")).resolves.toBeDefined();
  });

  it("registers the demo data seeder", async () => {
    const { ConfigModule } = await import("@eddie/config");
    const registerSpy = vi.spyOn(ConfigModule, "register");
    registerSpy.mockReturnValue({ module: class {} } as DynamicModule);

    const { ApiModule } = await import("../../src/api.module");
    const { DemoDataSeeder } = await import("../../src/demo/demo-data.seeder");

    const dynamicModule = (ApiModule as unknown as {
      forRoot: (options: CliRuntimeOptions) => DynamicModule;
    }).forRoot({});

    const providers = dynamicModule.providers ?? [];

    expect(collectProviderTokens(providers)).toContain(DemoDataSeeder);
  });

});
