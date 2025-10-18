import { EventEmitter } from "node:events";
import type { Request, Response, NextFunction } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("on-finished", () => ({
  __esModule: true,
  default: (res: Response & Partial<EventEmitter>, callback: () => void) => {
    if (typeof res.once === "function") {
      res.once("finish", callback);
      return;
    }

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

  const createResponse = (
    statusCode: number,
    contentLength?: string
  ): (Response & EventEmitter) =>
    Object.assign(new EventEmitter(), {
      statusCode,
      get: vi.fn(() => contentLength),
    }) as unknown as Response & EventEmitter;

  it("logs request metadata once the response finishes", () => {
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
    const res = createResponse(200, "123");
    const next = vi.fn<Parameters<NextFunction>, void>();

    middleware.use(req, res, next);

    res.emit("finish");

    expect(next).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(
      {
        method: "GET",
        url: "/health",
        statusCode: 200,
        contentLength: 123,
        durationMs: 5,
        userAgent: "vitest",
      },
      "HTTP request completed"
    );
  });

  it("logs only after the response emits finish", () => {
    const logger = { info: vi.fn() };

    const middleware = new HttpLoggerMiddleware(logger as unknown as Logger);
    const req = {
      method: "POST",
      originalUrl: "/jobs",
      get: vi.fn(),
    } as unknown as Request;
    const res = createResponse(202);
    const next = vi.fn<Parameters<NextFunction>, void>();

    middleware.use(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(logger.info).not.toHaveBeenCalled();

    res.emit("finish");

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        url: "/jobs",
        statusCode: 202,
      }),
      "HTTP request completed"
    );
  });
});
