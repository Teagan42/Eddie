import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import chalk from "chalk";
import type { StreamEvent } from "@eddie/types";
import { StreamRendererService } from "../src/stream-renderer.service";

const prefixFor = (agentId: string): string => `${chalk.magenta(`[${agentId}]`)} `;

describe("StreamRendererService", () => {
  let writeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    writeSpy.mockRestore();
  });

  it("prefixes delta output with the agent identifier", () => {
    const renderer = new StreamRendererService();
    const event = {
      type: "delta",
      text: "hello world",
      agentId: "manager",
    } as StreamEvent;

    renderer.render(event);

    expect(writeSpy).toHaveBeenCalledWith(`${prefixFor("manager")}hello world`);
  });

  it("prefixes each newline-delimited delta segment with the agent identifier", () => {
    const renderer = new StreamRendererService();
    const event = {
      type: "delta",
      text: "first line\nsecond line",
      agentId: "manager",
    } as StreamEvent;

    renderer.render(event);

    expect(writeSpy).toHaveBeenCalledWith(
      `${prefixFor("manager")}first line\n${prefixFor("manager")}second line`
    );
  });

  it("prefixes structured event output with the agent identifier", () => {
    const renderer = new StreamRendererService();
    const event = {
      type: "tool_result",
      name: "bash",
      agentId: "worker",
      result: {
        schema: "eddie.tool.test",
        content: "done",
      },
    } as StreamEvent;

    renderer.render(event);

    expect(writeSpy).toHaveBeenCalledWith(
      `\n${prefixFor("worker")}${chalk.green("[tool_result]")} bash <eddie.tool.test> done\n`
    );
  });
});
