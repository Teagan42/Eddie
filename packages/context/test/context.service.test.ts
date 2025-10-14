import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContextConfig } from "@eddie/config";
import type { LoggerService } from "@eddie/io";
import type { TemplateRendererService } from "@eddie/templates";

const { globMock } = vi.hoisted(() => ({
  globMock: vi.fn<[string | string[], unknown?], Promise<string[]>>(),
}));

vi.mock("fast-glob", () => ({
  default: globMock,
}));

const { readFileMock, statMock } = vi.hoisted(() => ({
  readFileMock: vi.fn<[string, string], Promise<string>>(),
  statMock: vi.fn<[string], Promise<{ size: number }>>(),
}));

vi.mock("fs/promises", () => ({
  default: {
    readFile: readFileMock,
    stat: statMock,
  },
}));

const logger = { debug: vi.fn(), warn: vi.fn() };
const loggerService = {
  getLogger: vi.fn(() => logger),
} as unknown as LoggerService;
const templateRenderer = {
  render: vi.fn(),
} as unknown as TemplateRendererService;

import { ContextService } from "../src/context.service";

const createService = () => new ContextService(loggerService, templateRenderer);

const createConfig = (overrides: Partial<ContextConfig> = {}): ContextConfig => ({
  include: ["**/*"],
  ...overrides,
});

describe("ContextService size guards", () => {
  beforeEach(() => {
    globMock.mockReset();
    globMock.mockResolvedValue([]);
    readFileMock.mockReset();
    readFileMock.mockResolvedValue("");
    statMock.mockReset();
    statMock.mockResolvedValue({ size: 0 });
    logger.debug.mockClear();
    logger.warn.mockClear();
  });

  it("skips reading context files that would exceed the max byte budget", async () => {
    const service = createService();
    globMock.mockResolvedValueOnce(["too-big.txt"]);
    statMock.mockResolvedValueOnce({ size: 500 });

    const result = await service.pack(
      createConfig({
        baseDir: "/tmp/context",
        include: ["too-big.txt"],
        maxBytes: 100,
      })
    );

    expect(readFileMock).not.toHaveBeenCalled();
    expect(result.files).toHaveLength(0);
  });

  it("skips reading bundle files that would exceed the remaining byte budget", async () => {
    const service = createService();
    globMock.mockResolvedValueOnce(["small.txt"]);
    globMock.mockResolvedValueOnce(["bundle.txt"]);

    statMock.mockResolvedValueOnce({ size: 20 });
    statMock.mockResolvedValueOnce({ size: 200 });

    readFileMock.mockResolvedValueOnce("small file content");

    const result = await service.pack(
      createConfig({
        baseDir: "/tmp/context",
        include: ["small.txt"],
        maxBytes: 100,
        resources: [
          {
            id: "bundle",
            type: "bundle",
            include: ["bundle.txt"],
          },
        ],
      })
    );

    expect(readFileMock).toHaveBeenCalledTimes(1);
    expect(readFileMock.mock.calls[0]).toEqual([
      path.resolve("/tmp/context", "small.txt"),
      "utf-8",
    ]);
    expect(result.resources).toHaveLength(0);
  });
});
