import { describe, expect, it } from "vitest";
import { HealthController } from "../../../src/controllers/health.controller";

describe("HealthController", () => {
  const controller = new HealthController();

  it("returns an ok status for liveness checks", () => {
    expect(controller.check()).toEqual({ status: "ok" });
  });

  it("returns a ready status for readiness checks", () => {
    expect(controller.readiness()).toEqual({ status: "ready" });
  });
});
