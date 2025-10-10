import "reflect-metadata";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SwaggerModule } from "@nestjs/swagger";

import { configureOpenApi } from "../../src/openapi-config";
import { OpenApiModule } from "../../src/openapi.module";

describe("configureOpenApi", () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({}).compile();
    app = moduleRef.createNestApplication();
  });

  afterEach(async () => {
    await app.close();
    vi.restoreAllMocks();
  });

  it("serves swagger ui and json", async () => {
    const document = { openapi: "3.1.0" } as const;
    const createDocumentSpy = vi
      .spyOn(SwaggerModule, "createDocument")
      .mockReturnValue(document as never);

    await configureOpenApi(app);
    await app.init();

    expect(createDocumentSpy).toHaveBeenCalledWith(
      app,
      expect.objectContaining({
        info: expect.objectContaining({
          title: "Eddie API",
          version: "1.0.0",
        }),
      }),
      expect.objectContaining({ include: [OpenApiModule] })
    );

    const jsonResponse = await request(app.getHttpServer()).get(
      "/openapi.json"
    );
    expect(jsonResponse.status).toBe(200);
    expect(jsonResponse.body).toEqual(document);

    const htmlResponse = await request(app.getHttpServer()).get("/openapi");
    expect(htmlResponse.status).toBe(200);
    expect(htmlResponse.text).toContain("id=\"swagger-ui\"");
  });
});
