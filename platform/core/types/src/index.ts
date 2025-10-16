import type { PackedResource } from "./providers";

export type {
  AgentDefinition,
  AgentInvocationOptions,
  AgentInvocationRuntimeDetails,
  AgentRuntimeCatalog,
  AgentRuntimeDescriptor,
  AgentRuntimeMetadata,
  AgentSpawnHandler,
} from "./agents";

export * from "./providers";
export * from "./config";
export * from "./hooks";
export * from "./api";
export * from "./chat-sessions/events";

export function composeResourceText(resource: PackedResource): string {
  const label = resource.name ?? resource.id;
  const description = resource.description ? ` - ${resource.description}` : "";
  const body = resource.text.trimEnd();
  const lines = [`// Resource: ${label}${description}`];

  if (body.length > 0) {
    lines.push(body);
  }

  lines.push(`// End Resource: ${label}`);
  return lines.join("\n");
}
