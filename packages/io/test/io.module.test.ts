import "reflect-metadata";
import { MODULE_METADATA } from "@nestjs/common/constants";
import { describe, expect, it } from "vitest";
import { CqrsModule } from "@nestjs/cqrs";
import { IoModule } from "../src/io.module";
import { LoggerService } from "../src/logger.service";
import { ConfirmService } from "../src/confirm.service";
import { JsonlWriterService } from "../src/jsonl-writer.service";
import { StreamRendererService } from "../src/stream-renderer.service";
import { getLoggerToken } from "../src/logger.decorator";
import { AgentStreamEventHandler } from "../src/agent-stream-event.handler";

const getModuleMetadata = <T>(key: string): T =>
  Reflect.getMetadata(key, IoModule);

describe("IoModule", () => {
  it("provides and exports the IO services", () => {
    const providers = getModuleMetadata<unknown[]>(MODULE_METADATA.PROVIDERS);
    const exports = getModuleMetadata<unknown[]>(MODULE_METADATA.EXPORTS);

    expect(providers).toEqual(
      expect.arrayContaining([
        LoggerService,
        ConfirmService,
        JsonlWriterService,
        StreamRendererService,
        AgentStreamEventHandler,
        expect.objectContaining({ provide: getLoggerToken() }),
      ])
    );

    expect(exports).toEqual(
      expect.arrayContaining([
        LoggerService,
        ConfirmService,
        JsonlWriterService,
        StreamRendererService,
        AgentStreamEventHandler,
      ])
    );
  });

  it("imports CQRS utilities", () => {
    const imports = getModuleMetadata<unknown[]>(MODULE_METADATA.IMPORTS);

    expect(imports).toContain(CqrsModule);
  });

  it("is not configurable", () => {
    expect((IoModule as Record<string, unknown>).register).toBeUndefined();
  });
});
