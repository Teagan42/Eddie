import { NestFactory } from "@nestjs/core";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { writeFileSync } from "fs";
import { join } from "path";
import { OpenApiModule } from "./openapi.module";

async function generate(): Promise<void> {
  const app = await NestFactory.create(OpenApiModule, { logger: false });
  const config = new DocumentBuilder()
    .setTitle("Eddie API")
    .setDescription("REST and WebSocket surface for the Eddie control plane")
    .setVersion("1.0.0")
    .addTag("Chat Sessions")
    .addTag("Traces")
    .addTag("Logs")
    .addTag("Runtime Config")
    .addTag("Config")
    .addTag("Providers")
    .build();
  const document = SwaggerModule.createDocument(app, config);
  const outputPath = join(
    __dirname,
    "../../..",
    "packages",
    "api-client",
    "openapi.json"
  );
  writeFileSync(outputPath, JSON.stringify(document, null, 2));
  await app.close();
}

void generate();
