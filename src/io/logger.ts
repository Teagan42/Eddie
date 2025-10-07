import pino from "pino";

function resolveTransport(): pino.TransportSingleOptions | undefined {
  if (process.env.NODE_ENV === "production") return undefined;
  if (!process.stdout.isTTY) return undefined;

  try {
    // Dynamically require to avoid runtime failures if dependency is missing.
    require.resolve("pino-pretty");
    return {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "HH:MM:ss",
        ignore: "pid,hostname",
      },
    };
  } catch {
    return undefined;
  }
}

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: undefined,
  transport: resolveTransport(),
});

