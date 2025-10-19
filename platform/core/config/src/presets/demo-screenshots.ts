import type { EddieConfigInput } from "../types";

export const demoScreenshotsPreset: EddieConfigInput = {
  api: {
    persistence: { driver: "memory" },
    demo: {
      enabled: true,
      fixtures: {
        path: "apps/api/demo/fixtures/overview-demo.json",
      },
    },
  },
};
