import type { ToolCallCommandInput } from "../tool-call.store";

export class UpdateToolCallCommand {
  constructor(public readonly input: ToolCallCommandInput) {}
}
