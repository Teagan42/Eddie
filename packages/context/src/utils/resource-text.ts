import type { PackedResource } from "@eddie/types";

export function formatResourceText(resource: PackedResource): string {
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
