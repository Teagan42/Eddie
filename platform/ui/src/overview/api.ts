import type { RuntimeConfigDto } from "@eddie/api-client";

export interface OverviewConfigApi {
  get: () => Promise<RuntimeConfigDto>;
  update: (input: Partial<RuntimeConfigDto>) => Promise<RuntimeConfigDto>;
}

export interface OverviewApi {
  http?: {
    config?: OverviewConfigApi;
    [key: string]: unknown;
  };
  config?: OverviewConfigApi;
  [key: string]: unknown;
}

export function useOverviewApi(): OverviewApi {
  throw new Error("useOverviewApi is not implemented in the testing harness");
}
