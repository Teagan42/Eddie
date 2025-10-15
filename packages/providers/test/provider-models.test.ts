import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProviderAdapterFactory, ProviderConfig } from "@eddie/types";
import { AnthropicAdapterFactory } from "../src/anthropic";
import { OpenAIAdapterFactory } from "../src/openai";
import { OpenAICompatibleAdapterFactory } from "../src/openai_compatible";
import { ProviderFactoryService } from "../src/provider-factory.service";

const baseConfig: ProviderConfig = { name: "openai", apiKey: "key" };

const { openAIConstructor, openAIModelsList } = vi.hoisted(() => {
  const list = vi.fn();
  const ctor = vi.fn().mockImplementation(() => ({ models: { list } }));
  return { openAIConstructor: ctor, openAIModelsList: list };
});

vi.mock("openai", () => ({
  default: openAIConstructor,
}));

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));

vi.mock("undici", () => ({ fetch: fetchMock }));

describe("OpenAIAdapterFactory listModels", () => {
  beforeEach(() => {
    openAIConstructor.mockClear();
    openAIModelsList.mockReset();
  });

  it("returns string model ids from the OpenAI SDK", async () => {
    openAIModelsList.mockResolvedValueOnce({
      data: [{ id: "gpt-4o" }, { id: "gpt-4o-mini" }, { id: 42 }],
    });

    const factory = new OpenAIAdapterFactory();
    const models = await factory.listModels(baseConfig);

    expect(openAIConstructor).toHaveBeenCalledTimes(1);
    expect(openAIModelsList).toHaveBeenCalledTimes(1);
    expect(models).toEqual(["gpt-4o", "gpt-4o-mini"]);
  });
});

describe("AnthropicAdapterFactory listModels", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("requests models from the Anthropic HTTP API", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ id: "claude-3-opus" }, { id: 1 }] }),
    });

    const factory = new AnthropicAdapterFactory();
    const models = await factory.listModels({ name: "anthropic", apiKey: "key" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.anthropic.com/v1/models");
    expect(models).toEqual(["claude-3-opus"]);
  });
});

describe("OpenAICompatibleAdapterFactory listModels", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("requests models using the configured base URL", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ id: "mixtral-8x7b" }, { id: null }] }),
    });

    const factory = new OpenAICompatibleAdapterFactory();
    const models = await factory.listModels({
      name: "openai_compatible",
      apiKey: "token",
      baseUrl: "https://groq.example.com/v1",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://groq.example.com/v1/models");
    expect(models).toEqual(["mixtral-8x7b"]);
  });
});

describe("ProviderFactoryService listModels", () => {
  it("delegates to the matching factory", async () => {
    const listModels = vi.fn().mockResolvedValue(["foo"]);
    const factory: ProviderAdapterFactory = {
      name: "openai",
      create: vi.fn(),
      listModels,
    };
    const service = new ProviderFactoryService([factory]);

    const models = await service.listModels({ name: "openai" });

    expect(listModels).toHaveBeenCalledWith({ name: "openai" });
    expect(models).toEqual(["foo"]);
  });

  it("returns an empty array for noop providers", async () => {
    const service = new ProviderFactoryService([]);
    const models = await service.listModels({ name: "noop" });
    expect(models).toEqual([]);
  });

  it("throws for unknown providers", async () => {
    const service = new ProviderFactoryService([]);
    await expect(() => service.listModels({ name: "missing" })).rejects.toThrow(
      "Unknown provider: missing",
    );
  });
});
