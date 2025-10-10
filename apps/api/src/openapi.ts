import { NestFactory } from "@nestjs/core";
import { SwaggerModule } from "@nestjs/swagger";
import { writeFileSync } from "fs";
import { join } from "path";
import { OpenApiModule } from "./openapi.module";
import { createOpenApiDocumentConfig } from "./openapi-config";

async function generate(): Promise<void> {
  const app = await NestFactory.create(OpenApiModule, { logger: false });
  const config = createOpenApiDocumentConfig();
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
