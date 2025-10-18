import type { Request, Response, NextFunction } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("on-finished", () => ({
  default: (_res: Response, callback: () => void) => {
    callback();
  },
}));

import { HttpLoggerMiddleware } from "../../../src/middleware/http-logger.middleware";
import type { Logger } from "pino";

describe("HttpLoggerMiddleware", () => {
  const originalHrtime = process.hrtime.bigint;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    (process.hrtime as unknown as { bigint: () => bigint }).bigint = originalHrtime;
  });

  it.skip("logs request metadata once the response finishes", () => {
    const logger = { info: vi.fn() };

    (process.hrtime as unknown as { bigint: () => bigint }).bigint = vi
      .fn()
      .mockReturnValueOnce(0n)
      .mockReturnValueOnce(5_000_000n);

    const middleware = new HttpLoggerMiddleware(logger as unknown as Logger);
    const req = {
      method: "GET",
      originalUrl: "/health",
      get: vi.fn((header: string) => (header === "user-agent" ? "vitest" : undefined)),
    } as unknown as Request;
    const res = {
      statusCode: 200,
      get: vi.fn(() => "123"),
    } as unknown as Response;
    const next = vi.fn<Parameters<NextFunction>, void>();

    middleware.use(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(
      {
        method: "GET",
        url: "/health",
        statusCode: 200,
        contentLength: "123",
        durationMs: 5,
        userAgent: "vitest",
      },
      "HTTP request completed"
    );
  });
});
