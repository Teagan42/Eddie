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

const cloneWorkspace = (workspace: WorkspaceMetadata): WorkspaceMetadata => ({
  ...workspace,
  prebuild: workspace.prebuild ? [...workspace.prebuild] : undefined,
});

const workspaceCatalog: readonly WorkspaceMetadata[] = (workspacesJson as WorkspaceMetadata[]).map(
  cloneWorkspace
);

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

export const loadWorkspaceMatrix = (job: WorkspaceMatrixJob): WorkspaceMatrix => ({
  "node-version": [...nodeVersions[job]],
  workspace: loadWorkspaces(),
});
