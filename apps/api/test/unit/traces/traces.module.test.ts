import "reflect-metadata";
import { MODULE_METADATA } from "@nestjs/common/constants";
import type { Provider } from "@nestjs/common";
import { TracesModule } from "../../../src/traces/traces.module";
import { traceCommandHandlers } from "../../../src/traces/commands";
import { traceQueryHandlers } from "../../../src/traces/queries";
import { TracesGatewayEventsHandler } from "../../../src/traces/traces.gateway.events-handler";

describe("TracesModule", () => {
  const getImports = () =>
    (Reflect.getMetadata(MODULE_METADATA.IMPORTS, TracesModule) ?? []) as unknown[];
  const getProviders = () =>
    (Reflect.getMetadata(MODULE_METADATA.PROVIDERS, TracesModule) ?? []) as Provider[];

  it("imports the CQRS module", () => {
    const imports = getImports();
    const importNames = imports.map((moduleRef) =>
      typeof moduleRef === "function" ? moduleRef.name : undefined
    );

    expect(importNames).toEqual(expect.arrayContaining(["CqrsModule"]));
  });

  it("registers command, query, and gateway event handlers", () => {
    const providerClassNames = getProviders()
      .filter((provider): provider is Function => typeof provider === "function")
      .map((provider) => provider.name);

    for (const handler of [...traceCommandHandlers, ...traceQueryHandlers]) {
      expect(providerClassNames).toContain(handler.name);
    }

    expect(providerClassNames).toContain(TracesGatewayEventsHandler.name);
  });
});
