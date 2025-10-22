import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { loadWorkspaceEnv } from "./vite-env";

const rootDir = fileURLToPath(new URL("./", import.meta.url));
export default defineConfig(({ mode }) => {
  const env = loadWorkspaceEnv(mode, rootDir);
  const devApiTarget = env.VITE_DEV_API_TARGET ?? env.VITE_API_URL ?? "http://localhost:3000";

  return {
    plugins: [react()],
    envPrefix: ["NEXT_PUBLIC_", "VITE_"],
    resolve: {
      alias: [
        { find: "@", replacement: resolve(rootDir, "src") },
        { find: "@/", replacement: `${resolve(rootDir, "src")}/` },
        { find: "@eddie/ui", replacement: resolve(rootDir, "../../platform/ui/src") },
      ],
    },
    server: {
      host: "0.0.0.0",
      proxy: {
        "/api": {
          target: devApiTarget,
          changeOrigin: true,
          ws: true,
          rewrite: (path) => path.replace(/^\/api/u, ""),
        },
      },
    },
    test: {
      globals: true,
      environment: "jsdom",
      setupFiles: ["./vitest.setup.ts"],
      coverage: {
        provider: "v8",
        reporter: ["text", "json", "html"],
        reportsDirectory: "coverage",
      },
    },
  };
});
