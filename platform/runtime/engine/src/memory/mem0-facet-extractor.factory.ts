import type { MemoryFacetsConfig } from "@eddie/types";
import type {
  FacetExtractorStrategy,
  FacetExtractionContext,
  AgentMemoryRecord,
} from "@eddie/memory";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractFacetsFromMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!metadata) {
    return undefined;
  }

  const value = metadata.facets;
  return isRecord(value) ? value : undefined;
}

function mergeFacets(
  target: Record<string, unknown>,
  source: Record<string, unknown> | undefined,
): void {
  if (!source) {
    return;
  }

  for (const [key, value] of Object.entries(source)) {
    target[key] = value;
  }
}

function collectContextFacets(
  context: FacetExtractionContext,
): Record<string, unknown> | undefined {
  return extractFacetsFromMetadata(context.metadata);
}

function collectMemoryFacets(
  memories: AgentMemoryRecord[],
): Record<string, unknown> {
  return memories.reduce<Record<string, unknown>>((acc, memory) => {
    const facets = extractFacetsFromMetadata(memory.metadata);
    mergeFacets(acc, facets);
    return acc;
  }, {});
}

export function createMem0FacetExtractor(
  config: MemoryFacetsConfig | undefined,
): FacetExtractorStrategy | undefined {
  const strategy = config?.defaultStrategy?.trim();
  if (!strategy || strategy.toLowerCase() === "none") {
    return undefined;
  }

  return {
    extract(memories, context) {
      const facets: Record<string, unknown> = {};
      mergeFacets(facets, collectContextFacets(context));
      mergeFacets(facets, collectMemoryFacets(memories));

      if (!("strategy" in facets)) {
        facets.strategy = strategy;
      }

      return facets;
    },
  } satisfies FacetExtractorStrategy;
}
