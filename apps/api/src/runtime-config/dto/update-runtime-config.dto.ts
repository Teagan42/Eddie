import { PartialType } from "@nestjs/swagger";
import { RuntimeConfigDto } from "./runtime-config.dto";

export class UpdateRuntimeConfigDto extends PartialType(RuntimeConfigDto) {}
