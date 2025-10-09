import { beforeEach, describe, expect, it, vi } from "vitest";

const loadEnvMock = vi.fn();

vi.mock("vite", () => ({
  loadEnv: loadEnvMock,
}));

describe("loadWorkspaceEnv", () => {
  beforeEach(async () => {
    loadEnvMock.mockReset();
    await vi.resetModules();
  });

  it("merges root and workspace env with workspace precedence", async () => {
    loadEnvMock
      .mockReturnValueOnce({ VITE_API_URL: "http://root", VITE_WEBSOCKET_URL: "ws://root" })
      .mockReturnValueOnce({ VITE_API_URL: "http://workspace" });

    const { loadWorkspaceEnv } = await import("./vite-env");

    const result = loadWorkspaceEnv("development", "/workspace/Eddie/apps/web");

    expect(loadEnvMock).toHaveBeenNthCalledWith(1, "development", "/workspace/Eddie", "");
    expect(loadEnvMock).toHaveBeenNthCalledWith(2, "development", "/workspace/Eddie/apps/web", "");
    expect(result).toEqual({
      VITE_API_URL: "http://workspace",
      VITE_WEBSOCKET_URL: "ws://root",
    });
  });

  it("includes websocket url from workspace when present", async () => {
    loadEnvMock
      .mockReturnValueOnce({})
      .mockReturnValueOnce({ VITE_WEBSOCKET_URL: "ws://workspace" });

    const { loadWorkspaceEnv } = await import("./vite-env");

    const result = loadWorkspaceEnv("production", "/workspace/Eddie/apps/web");

    expect(loadEnvMock).toHaveBeenCalledTimes(2);
    expect(loadEnvMock).toHaveBeenNthCalledWith(1, "production", "/workspace/Eddie", "");
    expect(result.VITE_WEBSOCKET_URL).toBe("ws://workspace");
  });
});
