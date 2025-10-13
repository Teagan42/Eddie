import type {
  TranscriptCompactor,
  TranscriptCompactorConfig,
  TranscriptCompactorFactory,
  TranscriptCompactorFactoryContext,
} from "./types";

const registry = new Map<string, TranscriptCompactorFactory>();
const builtinFactories = new Map<string, TranscriptCompactorFactory>();

export interface RegisterTranscriptCompactorOptions {
  builtin?: boolean;
}

export function registerTranscriptCompactor(
  factory: TranscriptCompactorFactory,
  options: RegisterTranscriptCompactorOptions = {},
): void {
  if (!factory || typeof factory.strategy !== "string") {
    throw new Error("Transcript compactor factory must declare a strategy id.");
  }

  registry.set(factory.strategy, factory);

  if (options.builtin) {
    builtinFactories.set(factory.strategy, factory);
  }
}

export function unregisterTranscriptCompactor(strategy: string): void {
  registry.delete(strategy);
  if (!builtinFactories.has(strategy)) {
    return;
  }
  registry.set(strategy, builtinFactories.get(strategy)!);
}

export function getTranscriptCompactorFactory(
  strategy: string,
): TranscriptCompactorFactory | undefined {
  return registry.get(strategy);
}

export function createTranscriptCompactor(
  config: TranscriptCompactorConfig,
  context: TranscriptCompactorFactoryContext,
): TranscriptCompactor {
  const strategy = config?.strategy;
  if (!strategy || typeof strategy !== "string") {
    throw new Error("Transcript compactor configuration requires a strategy id.");
  }

  const factory = getTranscriptCompactorFactory(strategy);

  if (!factory) {
    throw new Error(
      `Unsupported transcript compactor strategy "${strategy}" for ${context.agentId}.`,
    );
  }

  return factory.create(config, context);
}

export function listTranscriptCompactors(): TranscriptCompactorFactory[] {
  return Array.from(registry.values());
}

export function resetTranscriptCompactorRegistry(): void {
  registry.clear();
  for (const factory of builtinFactories.values()) {
    registry.set(factory.strategy, factory);
  }
}

