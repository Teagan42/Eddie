import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
  @Get()
  check(): Record<string, string> {
    return { status: "ok" };
  }

  @Get("ready")
  readiness(): Record<string, string> {
    return { status: "ready" };
  }
}
