import type { ToolCallCommandInput } from "../tool-call.store";

export class StartToolCallCommand {
  constructor(public readonly input: ToolCallCommandInput) {}
}
