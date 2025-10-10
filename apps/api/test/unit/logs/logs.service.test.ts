import { beforeEach, describe, expect, it, vi } from "vitest";
import { LogsService } from "../../../src/logs/logs.service";

const advanceTime = (ms: number): void => {
  vi.advanceTimersByTime(ms);
};

describe("LogsService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00.000Z"));
  });

  it("returns a paginated slice of logs using offset and limit", () => {
    const service = new LogsService();

    for (let index = 0; index < 5; index += 1) {
      service.append("info", `message-${index}`);
      advanceTime(1000);
    }

    const page = service.list({ offset: 1, limit: 3 });

    expect(page).toHaveLength(3);
    expect(page.map((entry) => entry.message)).toEqual([
      "message-1",
      "message-2",
      "message-3",
    ]);
  });

  it("drops the oldest log entries once the in-memory capacity is exceeded", () => {
    const service = new LogsService();

    const totalEntries = 205;
    for (let index = 0; index < totalEntries; index += 1) {
      service.append("info", `message-${index}`);
      advanceTime(10);
    }

    const entries = service.list({ limit: totalEntries });

    expect(entries).toHaveLength(200);
    expect(entries[0]?.message).toBe("message-5");
    expect(entries.at(-1)?.message).toBe("message-204");
  });
});
