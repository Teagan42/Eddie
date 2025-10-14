import path from "path";
import type { Stats } from "fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LoggerService } from "@eddie/io";
import type { TemplateRendererService } from "@eddie/templates";
import { ContextService } from "../src/context.service";

const fsMocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  stat: vi.fn(),
}));

const globMock = vi.hoisted(() => vi.fn());

vi.mock("fs/promises", () => ({
  default: {
    readFile: fsMocks.readFile,
    stat: fsMocks.stat,
  },
  readFile: fsMocks.readFile,
  stat: fsMocks.stat,
}));

vi.mock("fast-glob", () => ({
  default: globMock,
}));

describe("ContextService byte budget checks", () => {
  beforeEach(() => {
    fsMocks.readFile.mockReset();
    fsMocks.stat.mockReset();
    globMock.mockReset();
  });

  const createService = () => {
    const logger = {
      debug: vi.fn(),
      warn: vi.fn(),
    };
    const loggerService = {
      getLogger: vi.fn(() => logger),
    } as unknown as LoggerService;

    const templateRenderer = {
      renderTemplate: vi.fn(async () => "template"),
    } as unknown as TemplateRendererService;

    return new ContextService(loggerService, templateRenderer);
  };

  it("skips files exceeding the byte budget without reading them", async () => {
    const service = createService();
    globMock.mockResolvedValueOnce(["large.txt"]);
    fsMocks.stat.mockResolvedValueOnce({ size: 150 } as Stats);

    const result = await service.pack({ baseDir: "/repo", maxBytes: 100 });

    expect(fsMocks.stat).toHaveBeenCalledWith(path.resolve("/repo", "large.txt"));
    expect(fsMocks.readFile).not.toHaveBeenCalled();
    expect(result.files).toHaveLength(0);
  });

  it("includes files within the byte budget after stat check", async () => {
    const service = createService();
    globMock.mockResolvedValueOnce(["small.txt"]);
    fsMocks.stat.mockResolvedValueOnce({ size: 40 } as Stats);
    fsMocks.readFile.mockResolvedValueOnce("x".repeat(40));

    const result = await service.pack({ baseDir: "/repo", maxBytes: 100 });

    expect(fsMocks.stat).toHaveBeenCalledWith(path.resolve("/repo", "small.txt"));
    expect(fsMocks.readFile).toHaveBeenCalledTimes(1);
    expect(result.files).toHaveLength(1);
    expect(result.totalBytes).toBe(40);
  });

  it("skips bundle files exceeding the budget without reading them", async () => {
    const service = createService();
    globMock.mockResolvedValueOnce([]);
    globMock.mockResolvedValueOnce(["bundle/large.txt"]);
    fsMocks.stat.mockResolvedValueOnce({ size: 400 } as Stats);

    const result = await service.pack({
      baseDir: "/repo",
      maxBytes: 100,
      resources: [
        {
          id: "bundle",
          type: "bundle",
          include: ["bundle/**/*.txt"],
        },
      ],
    });

    expect(fsMocks.stat).toHaveBeenCalledWith(path.resolve("/repo", "bundle/large.txt"));
    expect(fsMocks.readFile).not.toHaveBeenCalled();
    expect(result.resources).toHaveLength(0);
  });

  it("passes exclude patterns to the main glob via ignore option", async () => {
    const service = createService();
    globMock.mockResolvedValueOnce([]);

    await service.pack({
      baseDir: "/repo",
      exclude: ["**/skip/**"],
    });

    expect(globMock).toHaveBeenNthCalledWith(
      1,
      expect.any(Array),
      expect.objectContaining({
        ignore: expect.arrayContaining(["**/skip/**"]),
      })
    );
  });

  it("passes bundle exclude patterns to the glob via ignore option", async () => {
    const service = createService();
    globMock.mockResolvedValueOnce([]);
    globMock.mockResolvedValueOnce([]);

    await service.pack({
      baseDir: "/repo",
      resources: [
        {
          id: "bundle",
          type: "bundle",
          include: ["bundle/**/*.txt"],
          exclude: ["bundle/private/**"],
        },
      ],
    });

    expect(globMock).toHaveBeenNthCalledWith(
      2,
      expect.any(Array),
      expect.objectContaining({
        ignore: expect.arrayContaining(["bundle/private/**"]),
      })
    );
  });
});
