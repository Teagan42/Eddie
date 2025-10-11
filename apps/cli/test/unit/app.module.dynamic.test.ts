import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfigModuleOptions } from "@eddie/config";

describe("AppModule configuration", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  it("forwards CLI runtime options into ConfigModule registration", async () => {
    const { ConfigModule } = await import("@eddie/config");
    const registerAsyncSpy = vi.spyOn(ConfigModule, "registerAsync");

    const runtimeOptions: ConfigModuleOptions = {
      logLevel: "info",
    };

    const { AppModule } = await import("../../src/app.module");

    const dynamicModule = (AppModule as unknown as {
      registerAsync: typeof ConfigModule.registerAsync;
    }).registerAsync({
      useFactory: async () => runtimeOptions,
    });

    expect(registerAsyncSpy).toHaveBeenCalled();

    const registration = registerAsyncSpy.mock.calls.at(-1)?.[0];
    expect(registration).toBeDefined();

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
