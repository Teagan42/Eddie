import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DynamicModule } from "@nestjs/common";
import type { ConfigModuleOptions } from "@eddie/config";

describe("ApiModule configuration", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("forRoot includes ConfigModule registration with runtime options", async () => {
    const { ConfigModule } = await import("@eddie/config");
    const registerSpy = vi.spyOn(ConfigModule, "register");
    const registrationResult = { module: class {} } as DynamicModule;
    registerSpy.mockReturnValue(
      registrationResult as ReturnType<typeof ConfigModule.register>,
    );

    const runtimeOptions: ConfigModuleOptions = {
      logLevel: "debug",
    };

    const { ApiModule } = await import("../../src/api.module");

    const dynamicModule = (ApiModule as unknown as {
      forRoot: (options?: ConfigModuleOptions) => DynamicModule;
    }).forRoot(runtimeOptions);

    expect(registerSpy).toHaveBeenCalledWith(runtimeOptions);
    expect(dynamicModule.imports).toContain(registrationResult);
  });

  it("forRootAsync forwards CLI runtime options via ConfigModule", async () => {
    const { ConfigModule } = await import("@eddie/config");
    const registerAsyncSpy = vi.spyOn(ConfigModule, "registerAsync");
    const registrationResult = { module: class {} } as DynamicModule;
    registerAsyncSpy.mockReturnValue(
      registrationResult as ReturnType<typeof ConfigModule.registerAsync>,
    );

    const runtimeOptions: ConfigModuleOptions = {
      logLevel: "debug",
    };

    const { ApiModule } = await import("../../src/api.module");

    const dynamicModule = (ApiModule as unknown as {
      forRootAsync: (typeof ConfigModule)["registerAsync"];
    }).forRootAsync({
      useFactory: async () => runtimeOptions,
    });

    expect(registerAsyncSpy).toHaveBeenCalled();

    const registration = registerAsyncSpy.mock.calls.at(-1)?.[0];
    expect(registration).toBeDefined();

    expect(dynamicModule.imports).toContain(registrationResult);

    const optionsProvider = (dynamicModule.providers ?? []).find(
      (provider): provider is { provide: unknown } =>
        typeof provider === "object" && provider !== null && "provide" in provider,
    );

    expect(optionsProvider).toBeDefined();

    expect(registration?.inject).toContainEqual({
      token: optionsProvider?.provide,
      optional: true,
    });

    await expect(registration?.useFactory(runtimeOptions)).resolves.toEqual(
      runtimeOptions,
    );
  });
});
