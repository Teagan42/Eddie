import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { Public } from "../auth/public.decorator";

@ApiTags("health")
@Controller("health")
export class HealthController {
  @Public()
  @ApiOkResponse({ description: "Liveness state" })
  @Get()
  check(): Record<string, string> {
    return { status: "ok" };
  }

  @Public()
  @ApiOkResponse({ description: "Readiness state" })
  @Get("ready")
  readiness(): Record<string, string> {
    return { status: "ready" };
  }
}
