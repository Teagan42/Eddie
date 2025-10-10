import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

export function createOpenApiDocumentConfig() {
  return new DocumentBuilder()
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
}

export async function configureOpenApi(app: INestApplication): Promise<void> {
  const config = createOpenApiDocumentConfig();
  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup("openapi", app, document, {
    jsonDocumentUrl: "/openapi.json",
    customSiteTitle: "Eddie API Reference",
  });
}
