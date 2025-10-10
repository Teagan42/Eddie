import { describe, expect, it, vi } from "vitest";
import { LogsController } from "../../../src/logs/logs.controller";
import type { LogsService } from "../../../src/logs/logs.service";

describe("LogsController", () => {
  it("delegates to the logs service with pagination parameters", () => {
    const list = vi.fn().mockReturnValue([]);
    const controller = new LogsController({ list } as unknown as LogsService);

    const result = controller.list(5, 10);

    expect(result).toEqual([]);
    expect(list).toHaveBeenCalledWith({ offset: 5, limit: 10 });
  });

  it("applies default pagination when parameters are missing", () => {
    const list = vi.fn().mockReturnValue([]);
    const controller = new LogsController({ list } as unknown as LogsService);

    controller.list();

    expect(list).toHaveBeenCalledWith({ offset: 0, limit: 50 });
  });
});
