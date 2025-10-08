import { Controller, Get } from "@nestjs/common";
import { Public } from "../auth/public.decorator";

@Controller("health")
export class HealthController {
  @Public()
  @Get()
  check(): Record<string, string> {
    return { status: "ok" };
  }

  @Public()
  @Get("ready")
  readiness(): Record<string, string> {
    return { status: "ready" };
  }
}
