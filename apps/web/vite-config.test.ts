import { describe, expect, it, vi } from "vitest";

type DevServerConfig = { host?: string };
type ConfigFactory = (options: { mode: string; command: string }) => { server?: DevServerConfig };

const loadWorkspaceEnv = vi.fn(() => ({ VITE_DEV_API_TARGET: "http://api" }));

const fileURLToPathMock = () => "/workspace/Eddie/apps/web";

vi.mock("node:url", () => ({
  fileURLToPath: fileURLToPathMock,
  default: {
    fileURLToPath: fileURLToPathMock,
  },
}));

vi.mock("vite", () => ({
  defineConfig: (config: unknown) => config,
}));

vi.mock("./vite-env", () => ({
  loadWorkspaceEnv,
}));

vi.mock("@vitejs/plugin-react-swc", () => ({
  default: () => ({ name: "mock-react-swc" }),
}));

describe("vite.config", () => {
  it("binds the dev server to all interfaces for external access", async () => {
    const { default: createConfig } = await import("./vite.config");
    const config = (createConfig as ConfigFactory)({ mode: "development", command: "serve" });

    expect(config.server?.host).toBe("0.0.0.0");
  });
});
