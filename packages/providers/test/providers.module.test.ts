import type { FactoryProvider } from "@nestjs/common";
import { MODULE_METADATA } from "@nestjs/common/constants";
import {
  ProvidersModule,
  adapterFactoryProviders,
} from "../src/providers.module";
import { AnthropicAdapterFactory } from "../src/anthropic";
import { OpenAIAdapterFactory } from "../src/openai";
import { OpenAICompatibleAdapterFactory } from "../src/openai_compatible";
import { expectTypeOf } from "vitest";

describe("ProvidersModule", () => {
  const providers: unknown[] =
    Reflect.getMetadata(MODULE_METADATA.PROVIDERS, ProvidersModule) ?? [];

  const factoryProviderFor = (token: unknown) =>
    providers.find((candidate) =>
      typeof candidate === "object" && candidate
        ? (candidate as { provide?: unknown }).provide === token
        : false
    );

  it("provides AnthropicAdapterFactory via factory provider", () => {
    const provider = factoryProviderFor(AnthropicAdapterFactory);
    expect(provider).toBeDefined();
    expect((provider as { useFactory?: unknown }).useFactory).toEqual(
      expect.any(Function)
    );
    expect((provider as { inject?: unknown[] }).inject).toEqual([]);
  });

  it("provides OpenAIAdapterFactory via factory provider", () => {
    const provider = factoryProviderFor(OpenAIAdapterFactory);
    expect(provider).toBeDefined();
    expect((provider as { useFactory?: unknown }).useFactory).toEqual(
      expect.any(Function)
    );
    expect((provider as { inject?: unknown[] }).inject).toEqual([]);
  });

  it("provides OpenAICompatibleAdapterFactory via factory provider", () => {
    const provider = factoryProviderFor(OpenAICompatibleAdapterFactory);
    expect(provider).toBeDefined();
    expect((provider as { useFactory?: unknown }).useFactory).toEqual(
      expect.any(Function)
    );
    expect((provider as { inject?: unknown[] }).inject).toEqual([]);
  });

  it("types adapter factory providers as factory providers", () => {
    expectTypeOf(adapterFactoryProviders).toMatchTypeOf<FactoryProvider[]>();
  });
});
