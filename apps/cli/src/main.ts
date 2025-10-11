#!/usr/bin/env node
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { resolveCliRuntimeOptionsFromEnv } from "@eddie/config";
import { AppModule } from "./app.module";
import { CliRunnerService } from "./cli/cli-runner.service";

async function bootstrap(): Promise<void> {
  const runtimeOptions = resolveCliRuntimeOptionsFromEnv(process.env);
  const app = await NestFactory.createApplicationContext(
    AppModule.forRoot(runtimeOptions),
  );

  let exitCode = 0;

  try {
    const runner = app.get(CliRunnerService);
    await runner.run(process.argv.slice(2));
  } catch (error) {
    exitCode = 1;
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
  } finally {
    await app.close();
    if (exitCode !== 0) {
      process.exit(exitCode);
    }
  }
}

void bootstrap();
