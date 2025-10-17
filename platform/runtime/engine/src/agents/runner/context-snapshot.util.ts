import type { PackedContext } from "@eddie/types";

export type PackedContextSnapshot = PackedContext & {
  selectedBundleIds?: string[];
};

export interface ContextSnapshot {
  clone: PackedContextSnapshot;
  bundleIds: string[];
}

export const cloneContext = (context: PackedContext): PackedContextSnapshot => ({
  ...context,
  files: context.files.map((file) => ({ ...file })),
  resources: context.resources?.map((resource) => ({
    ...resource,
    files: resource.files?.map((file) => ({ ...file })),
  })),
});

export const collectSelectedBundleIds = (context: PackedContext): string[] => {
  if (!context.resources || context.resources.length === 0) {
    return [];
  }

  return context.resources
    .filter((resource) => resource.type === "bundle")
    .map((resource) => resource.id)
    .filter((id): id is string => typeof id === "string" && id.trim().length > 0);
};

export const createContextSnapshot = (context: PackedContext): ContextSnapshot => {
  const clone = cloneContext(context);
  const bundleIds = collectSelectedBundleIds(context);

  if (bundleIds.length > 0) {
    clone.selectedBundleIds = bundleIds;
  }

  return { clone, bundleIds };
};
