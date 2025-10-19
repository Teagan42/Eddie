import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import { ConfigStore } from "@eddie/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { DemoFixtureValidationError } from "./demo-fixture.validation-error";

type DemoFixtureEvent = { timestamp?: unknown };

type DemoFixture = { events?: DemoFixtureEvent[] };

@Injectable()
export class DemoDataLoader implements OnModuleInit {
  constructor(
    @Inject(ConfigStore) private readonly configStore: ConfigStore,
  ) {}

  async onModuleInit(): Promise<void> {
    const snapshot = this.configStore.getSnapshot();
    const files = snapshot.api?.demoSeeds?.files;

    if (!Array.isArray(files) || files.length === 0) {
      return;
    }

    for (const file of files) {
      const resolvedPath = path.isAbsolute(file)
        ? file
        : path.resolve(process.cwd(), file);

      await this.validateFixture(resolvedPath);
    }
  }

  private async validateFixture(resolvedPath: string): Promise<void> {
    let contents: string;

    try {
      contents = await readFile(resolvedPath, "utf8");
    } catch (error) {
      throw this.createValidationError(resolvedPath, "file", error);
    }

    let parsed: DemoFixture;

    try {
      parsed = JSON.parse(contents) as DemoFixture;
    } catch (error) {
      throw this.createValidationError(resolvedPath, "json", error ?? "Invalid JSON");
    }

    if (!Array.isArray(parsed.events)) {
      throw this.createValidationError(
        resolvedPath,
        "events",
        "Expected an array of events",
      );
    }

    parsed.events.forEach((event, index) => {
      if (!event || typeof event !== "object") {
        throw this.createValidationError(
          resolvedPath,
          `events[${index}]`,
          "Expected event to be an object",
        );
      }

      if (event.timestamp === undefined) {
        throw this.createValidationError(
          resolvedPath,
          `events[${index}].timestamp`,
          "Timestamp is required",
        );
      }
    });
  }

  private createValidationError(
    fixturePath: string,
    failurePath: string,
    reason: unknown,
  ): DemoFixtureValidationError {
    return new DemoFixtureValidationError(
      fixturePath,
      failurePath,
      this.normalizeReason(reason),
    );
  }

  private normalizeReason(reason: unknown): string {
    if (reason instanceof Error) {
      return reason.message;
    }

    if (typeof reason === "string" && reason.trim().length > 0) {
      return reason;
    }

    return "Unknown error";
  }
}
