import type { EddieConfigInput } from "../types";

export const cliLocalPreset: EddieConfigInput = {
  logging: {
    level: "debug",
    destination: {
      type: "stdout",
      pretty: true,
      colorize: true,
    },
    enableTimestamps: false,
  },
  output: {
    prettyStream: true,
  },
};
