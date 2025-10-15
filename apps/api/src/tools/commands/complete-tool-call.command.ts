import type { ToolCallCommandInput } from "../tool-call.store";

export class CompleteToolCallCommand {
  constructor(public readonly input: ToolCallCommandInput) {}
}
