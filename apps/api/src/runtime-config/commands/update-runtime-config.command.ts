import type { RuntimeConfigDto } from "../dto/runtime-config.dto";

export class UpdateRuntimeConfigCommand {
  constructor(public readonly partial: Partial<RuntimeConfigDto>) {}
}
