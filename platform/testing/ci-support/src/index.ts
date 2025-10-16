import workspacesJson from "../workspaces.json";

export interface WorkspaceMetadata {
  readonly name: string;
  readonly path: string;
  readonly coverage: string;
  readonly coverageArtifact: string;
  readonly dist: string;
  readonly tsbuildinfo: string;
  readonly tsconfig: string;
  readonly prebuild?: readonly string[];
}

export type WorkspaceMatrixJob = "lint" | "build" | "test";

export type WorkspaceMatrix = {
  readonly "node-version": readonly string[];
  readonly workspace: readonly WorkspaceMetadata[];
};

export interface LoadWorkspaceMatrixOptions {
  readonly changedWorkspaces?: readonly string[];
}

const cloneWorkspace = (workspace: WorkspaceMetadata): WorkspaceMetadata => ({
  ...workspace,
  prebuild: workspace.prebuild ? [...workspace.prebuild] : undefined,
});

const workspaceCatalog: readonly WorkspaceMetadata[] = (workspacesJson as WorkspaceMetadata[]).map(
  cloneWorkspace
);

const isAppWorkspace = (workspace: WorkspaceMetadata): boolean =>
  workspace.path.startsWith("apps/");

const nodeVersions: Record<WorkspaceMatrixJob, readonly string[]> = {
  lint: ["20.x"],
  build: ["20.x"],
  test: ["20.x", "22.x"],
};

export const loadWorkspaces = (): WorkspaceMetadata[] =>
  workspaceCatalog.map(cloneWorkspace);

export const getWorkspaceByName = (name: WorkspaceMetadata["name"]): WorkspaceMetadata => {
  const workspace = workspaceCatalog.find((entry) => entry.name === name);

  if (!workspace) {
    throw new Error(`Unknown workspace: ${name}`);
  }

  return cloneWorkspace(workspace);
};

const selectWorkspaces = (
  options?: LoadWorkspaceMatrixOptions
): WorkspaceMetadata[] => {
  const includeSet = options?.changedWorkspaces
    ? new Set(options.changedWorkspaces)
    : undefined;

  return workspaceCatalog
    .filter((workspace) => {
      if (isAppWorkspace(workspace)) {
        return true;
      }

      if (!includeSet) {
        return true;
      }

      return includeSet.has(workspace.name);
    })
    .map(cloneWorkspace);
};

export const selectWorkspaceNamesForPaths = (
  paths: readonly string[]
): readonly string[] => {
  const normalizedPaths = paths.map((item) => item.replaceAll("\\", "/"));
  const selected = new Set<string>();

  for (const workspace of workspaceCatalog) {
    if (isAppWorkspace(workspace)) {
      selected.add(workspace.name);
      continue;
    }

    for (const filePath of normalizedPaths) {
      if (
        filePath === workspace.path ||
        filePath.startsWith(`${workspace.path}/`)
      ) {
        selected.add(workspace.name);
        break;
      }
    }
  }

  return workspaceCatalog
    .map((workspace) => workspace.name)
    .filter((name) => selected.has(name));
};

export const loadWorkspaceMatrix = (
  job: WorkspaceMatrixJob,
  options?: LoadWorkspaceMatrixOptions
): WorkspaceMatrix => {
  const workspaceList =
    job === "build" ? loadWorkspaces() : selectWorkspaces(options);

  return {
    "node-version": [...nodeVersions[job]],
    workspace: workspaceList,
  };
};
