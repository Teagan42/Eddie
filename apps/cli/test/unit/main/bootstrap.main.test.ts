import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const stubs = vi.hoisted(() => ({
  createContextMock: vi.fn(),
  appCloseMock: vi.fn(),
  runnerRunMock: vi.fn(),
  forRootMock: vi.fn(),
  resolveEnvMock: vi.fn(),
}));

class CliRunnerServiceStub {
  run = stubs.runnerRunMock;
}

vi.mock("../../../src/cli/cli-runner.service", () => ({
  CliRunnerService: CliRunnerServiceStub,
}));

vi.mock("@nestjs/core", () => ({
  NestFactory: {
    createApplicationContext: stubs.createContextMock,
  },
}));

vi.mock("../../../src/app.module", () => ({
  AppModule: {
    forRoot: stubs.forRootMock,
  },
}));

vi.mock("@eddie/config", async () => {
  const actual = await vi.importActual<typeof import("@eddie/config")>(
    "@eddie/config",
  );
  return {
    ...actual,
    resolveCliRuntimeOptionsFromEnv: stubs.resolveEnvMock,
  };
});

describe("CLI bootstrap module configuration", () => {
  const originalEnv = { ...process.env };
  const originalArgv = process.argv.slice();

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    process.env = { ...originalEnv };
    process.argv = originalArgv.slice(0, 2);

    stubs.runnerRunMock.mockResolvedValue(undefined);
    stubs.appCloseMock.mockResolvedValue(undefined);

    stubs.createContextMock.mockResolvedValue({
      get: (token: unknown) => {
        if (token === CliRunnerServiceStub) {
          return new CliRunnerServiceStub();
        }
        return undefined;
      },
      close: stubs.appCloseMock,
    });

    stubs.forRootMock.mockReturnValue({});
    stubs.resolveEnvMock.mockReturnValue({});
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    process.argv = originalArgv.slice();
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("creates the application context using AppModule.forRoot", async () => {
    const runtimeOptions = { logLevel: "debug" };
    stubs.resolveEnvMock.mockReturnValue(runtimeOptions);
    const dynamicModule = Symbol("cli-module");
    stubs.forRootMock.mockReturnValue(dynamicModule);

    await import("../../../src/main");

    await vi.waitFor(() => expect(stubs.forRootMock).toHaveBeenCalled());

    expect(stubs.resolveEnvMock).toHaveBeenCalledWith(process.env);
    expect(stubs.forRootMock).toHaveBeenCalledTimes(1);
    expect(stubs.forRootMock.mock.calls[0]?.[0]).toEqual(runtimeOptions);

    const createArgs = stubs.createContextMock.mock.calls.at(-1);
    expect(createArgs?.[0]).toBe(dynamicModule);
  });

  it("combines env and CLI runtime options with CLI overrides", async () => {
    stubs.resolveEnvMock.mockReturnValue({
      tools: ["lint"],
      logLevel: "info",
    });

    process.argv = [
      "node",
      "eddie",
      "--log-level",
      "debug",
      "--context",
      "src",
      "--context",
      "docs",
    ];

    await import("../../../src/main");

    await vi.waitFor(() => expect(stubs.forRootMock).toHaveBeenCalled());

    const lastCall = stubs.forRootMock.mock.calls.at(-1);
    expect(lastCall?.[0]).toEqual({
      tools: ["lint"],
      logLevel: "debug",
      context: ["src", "docs"],
    });
  });
});
