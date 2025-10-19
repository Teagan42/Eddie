import path from "path";
import type { Stats } from "fs";
import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Test } from "@nestjs/testing";
import { LoggerService } from "@eddie/io";
import { TemplateRuntimeService } from "@eddie/templates";
import { ContextService } from "../src/context.service";

const fsMocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  stat: vi.fn(),
}));

const streamMocks = vi.hoisted(() => ({
  createReadStream: vi.fn(),
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

vi.mock("node:fs", () => ({
  createReadStream: streamMocks.createReadStream,
}));

vi.mock("fast-glob", () => ({
  default: globMock,
}));

const instantiateContextService = async () => {
  const logger = {
    debug: vi.fn(),
    warn: vi.fn(),
  };
  const loggerService = {
    getLogger: vi.fn(() => logger),
  } as unknown as LoggerService;

  const templateRuntime = {
    renderContextResource: vi.fn(async () => "template"),
  } as unknown as TemplateRuntimeService;

  const moduleRef = await Test.createTestingModule({
    providers: [
      { provide: LoggerService, useValue: loggerService },
      { provide: TemplateRuntimeService, useValue: templateRuntime },
    ],
  }).compile();

  await moduleRef.init();

  const loggerProvider = moduleRef.get(LoggerService);
  const runtime = moduleRef.get(TemplateRuntimeService);
  return new ContextService(loggerProvider, runtime);
};

describe("ContextService byte budget checks", () => {
  beforeEach(() => {
    fsMocks.readFile.mockReset();
    fsMocks.stat.mockReset();
    streamMocks.createReadStream.mockReset();
    globMock.mockReset();
  });

  it("skips files exceeding the byte budget without reading them", async () => {
    const service = await instantiateContextService();
    globMock.mockResolvedValueOnce(["large.txt"]);
    fsMocks.stat.mockResolvedValueOnce({ size: 150 } as Stats);

    const result = await service.pack({ baseDir: "/repo", maxBytes: 100 });

    expect(fsMocks.stat).toHaveBeenCalledWith(path.resolve("/repo", "large.txt"));
    expect(fsMocks.readFile).not.toHaveBeenCalled();
    expect(result.files).toHaveLength(0);
  });

  it("includes files within the byte budget after stat check", async () => {
    const service = await instantiateContextService();
    globMock.mockResolvedValueOnce(["small.txt"]);
    fsMocks.stat.mockResolvedValueOnce({ size: 40 } as Stats);
    streamMocks.createReadStream.mockReturnValueOnce(
      Readable.from(["x".repeat(40)], { objectMode: false })
    );
    fsMocks.readFile.mockImplementationOnce(() => {
      throw new Error("readFile should not be used when streaming");
    });

    const result = await service.pack({ baseDir: "/repo", maxBytes: 100 });

    expect(fsMocks.stat).toHaveBeenCalledWith(path.resolve("/repo", "small.txt"));
    expect(streamMocks.createReadStream).toHaveBeenCalledTimes(1);
    expect(result.files).toHaveLength(1);
    expect(result.totalBytes).toBe(40);
  });

  it("streams file contents when packing context", async () => {
    const service = await instantiateContextService();
    globMock.mockResolvedValueOnce(["big.txt"]);
    fsMocks.stat.mockResolvedValueOnce({ size: 80 } as Stats);

    const chunks = [
      "a".repeat(20),
      "b".repeat(20),
      "c".repeat(20),
      "d".repeat(20),
    ];
    streamMocks.createReadStream.mockReturnValueOnce(
      Readable.from(chunks, { objectMode: false })
    );
    fsMocks.readFile.mockImplementationOnce(() => {
      throw new Error("readFile should not be used when streaming");
    });

    const result = await service.pack({ baseDir: "/repo", maxBytes: 100 });

    expect(streamMocks.createReadStream).toHaveBeenCalledWith(
      path.resolve("/repo", "big.txt"),
      expect.objectContaining({ encoding: "utf-8", highWaterMark: expect.any(Number) })
    );
    expect(result.files).toEqual([
      {
        path: "big.txt",
        bytes: 80,
        content: chunks.join(""),
      },
    ]);
  });

  it("skips bundle files exceeding the budget without reading them", async () => {
    const service = await instantiateContextService();
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
    expect(streamMocks.createReadStream).not.toHaveBeenCalled();
    expect(result.resources).toHaveLength(0);
  });

  it("passes exclude patterns to the main glob via ignore option", async () => {
    const service = await instantiateContextService();
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
    const service = await instantiateContextService();
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

  it("applies basename exclude patterns across nested directories", async () => {
    const service = await instantiateContextService();
    globMock.mockResolvedValueOnce(["nested/output.log"]);

    const result = await service.pack({
      baseDir: "/repo",
      exclude: ["*.log"],
    });

    expect(fsMocks.stat).not.toHaveBeenCalled();
    expect(result.files).toHaveLength(0);
  });

  it("allows glob results that reference parent directories", async () => {
    const service = await instantiateContextService();
    globMock.mockResolvedValueOnce(["../shared/info.txt"]);
    fsMocks.stat.mockResolvedValueOnce({ size: 11 } as Stats);
    streamMocks.createReadStream.mockReturnValueOnce(
      Readable.from(["hello world"], { objectMode: false })
    );

    const result = await service.pack({
      baseDir: "/repo",
      include: ["../shared/info.txt"],
    });

    expect(fsMocks.stat).toHaveBeenCalledWith(
      path.resolve("/repo", "../shared/info.txt")
    );
    expect(result.files).toEqual([
      {
        path: "../shared/info.txt",
        bytes: 11,
        content: "hello world",
      },
    ]);
  });
});

describe("ContextService.computeStats", () => {
  beforeEach(() => {
    fsMocks.readFile.mockReset();
    fsMocks.stat.mockReset();
    globMock.mockReset();
  });

  it("returns file counts and byte totals without reading file contents", async () => {
    const service = await instantiateContextService();
    globMock.mockResolvedValueOnce(["stats.txt"]);
    fsMocks.stat.mockResolvedValueOnce({ size: 128 } as Stats);

    const stats = await service.computeStats({ baseDir: "/repo" });

    expect(stats).toEqual({ fileCount: 1, totalBytes: 128 });
    expect(fsMocks.readFile).not.toHaveBeenCalled();
  });
});
