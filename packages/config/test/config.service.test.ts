import fs from "fs/promises";
import path from "path";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from "vitest";

import { Test } from "@nestjs/testing";

import { ConfigService } from "../src/config.service";
import { DEFAULT_CONFIG } from "../src/defaults";
import { eddieConfig } from "../src/config.namespace";
import type { EddieConfig } from "../src/types";

describe("ConfigService", () => {
  const cwd = process.cwd();
  const repoConfigDir = path.join(cwd, "config");
  const repoConfigFile = path.join(repoConfigDir, "eddie.config.yaml");
  const overrideConfigDir = path.join(cwd, "tmp-config");
  const overrideConfigFile = path.join(overrideConfigDir, "eddie.config.yaml");

  beforeEach(async () => {
    await fs.rm(repoConfigDir, { recursive: true, force: true });
    await fs.rm(overrideConfigDir, { recursive: true, force: true });
    delete process.env.CONFIG_ROOT;
  });

  afterEach(async () => {
    await fs.rm(repoConfigDir, { recursive: true, force: true });
    await fs.rm(overrideConfigDir, { recursive: true, force: true });
    delete process.env.CONFIG_ROOT;
  });

  describe("namespaced defaults", () => {
    const ServiceCtor = ConfigService as unknown as new (
      defaults: EddieConfig | undefined,
      configService: {
        get: ReturnType<typeof vi.fn>;
      }
    ) => ConfigService;

    it("pulls defaults from the Nest config namespace when provided", async () => {
      const defaults = structuredClone(DEFAULT_CONFIG);
      defaults.api = {
        ...(defaults.api ?? {}),
        host: "192.0.2.10",
        port: 7777,
      };

      const configService = {
        get: vi.fn((key: string) => {
          if (key === "eddie") {
            return defaults;
          }

          return undefined;
        }),
      } as const;

      const service = new ServiceCtor(undefined, configService);

      const result = await service.compose({});

      expect(configService.get).toHaveBeenCalledWith("eddie", { infer: true });
      expect(result.api?.host).toBe("192.0.2.10");
      expect(result.api?.port).toBe(7777);
    });
  });

  describe("providers", () => {
    it("merges defaults exposed by the namespaced provider", async () => {
      const defaults = structuredClone(DEFAULT_CONFIG);
      defaults.api = {
        ...(defaults.api ?? {}),
        host: "192.0.2.50",
      };

      const moduleRef = await Test.createTestingModule({
        providers: [
          ConfigService,
          {
            provide: eddieConfig.KEY,
            useValue: defaults,
          },
        ],
      }).compile();

      const service = moduleRef.get(ConfigService);

      const result = await service.compose({});

      expect(result.api?.host).toBe("192.0.2.50");
    });
  });

  describe("compose", () => {
    it("prefers API host and port provided by the config file", async () => {
      const service = new ConfigService();

      const result = await service.compose({
        api: {
          host: "127.0.0.1",
          port: 4242,
        },
      });

      expect(result.api?.host).toBe("127.0.0.1");
      expect(result.api?.port).toBe(4242);
    });

    it("falls back to defaults when the config omits host and port", async () => {
      const service = new ConfigService();

      const result = await service.compose({
        api: {
          telemetry: { enabled: true },
        },
      });

      expect(result.api?.host).toBe("0.0.0.0");
      expect(result.api?.port).toBe(3000);
      expect(result.api?.persistence?.driver).toBe("memory");
    });

    it("accepts sqlite persistence configuration", async () => {
      const service = new ConfigService();

      const result = await service.compose({
        api: {
          persistence: {
            driver: "sqlite",
            sqlite: { filename: "./tmp/chat.sqlite" },
          },
        },
      });

      expect(result.api?.persistence).toEqual({
        driver: "sqlite",
        sqlite: { filename: "./tmp/chat.sqlite" },
      });
    });

    describe.each([
      [
        "postgres",
        {
          host: "198.51.100.11",
          port: 5432,
          database: "eddie_agents",
          user: "postgres_operator",
          password: "pg-secret",
        },
      ],
      [
        "mysql",
        {
          host: "198.51.100.12",
          port: 3306,
          database: "eddie_agents",
          user: "mysql_operator",
          password: "mysql-secret",
        },
      ],
      [
        "mariadb",
        {
          host: "198.51.100.13",
          port: 3307,
          database: "eddie_agents",
          user: "maria_operator",
          password: "maria-secret",
        },
      ],
    ])(
      "preserves %s connection configuration when provided",
      (driver, connection) => {
        it("keeps the connection block intact", async () => {
          const service = new ConfigService();

          const result = await service.compose({
            api: {
              persistence: {
                driver,
                [driver]: {
                  connection,
                },
              } as unknown,
            },
          });

          expect(result.api?.persistence).toMatchObject({
            driver,
            [driver]: {
              connection,
            },
          });
        });
      }
    );

    it("requires connection details when configuring postgres persistence", async () => {
      const service = new ConfigService();

      await expect(
        service.compose({
          api: {
            persistence: {
              driver: "postgres",
              postgres: {},
            },
          },
        })
      ).rejects.toThrow(
        "api.persistence.postgres.connection must be provided when using the postgres driver."
      );
    });

    it("rejects mysql connection urls that are not strings", async () => {
      const service = new ConfigService();

      await expect(
        service.compose({
          api: {
            persistence: {
              driver: "mysql",
              mysql: {
                connection: {
                  host: "198.51.100.12",
                  port: 3306,
                  database: "eddie_agents",
                  user: "mysql_operator",
                  password: "mysql-secret",
                },
                url: 1234 as unknown as string,
              },
            },
          },
        })
      ).rejects.toThrow(
        "api.persistence.mysql.url must be a string when provided. Received number."
      );
    });

    it("rejects mysql ssl flags that are not booleans", async () => {
      const service = new ConfigService();

      await expect(
        service.compose({
          api: {
            persistence: {
              driver: "mysql",
              mysql: {
                connection: {
                  host: "198.51.100.12",
                  port: 3306,
                  database: "eddie_agents",
                  user: "mysql_operator",
                  password: "mysql-secret",
                },
                ssl: "true" as unknown as boolean,
              },
            },
          },
        })
      ).rejects.toThrow(
        "api.persistence.mysql.ssl must be a boolean when provided. Received string."
      );
    });

    it("retains mysql url and ssl optional primitives", async () => {
      const service = new ConfigService();

      const result = await service.compose({
        api: {
          persistence: {
            driver: "mysql",
            mysql: {
              connection: {
                host: "198.51.100.12",
                port: 3306,
                database: "eddie_agents",
                user: "mysql_operator",
                password: "mysql-secret",
              },
              url: "mysql://mysql_operator:mysql-secret@198.51.100.12:3306/eddie_agents",
              ssl: true,
            },
          },
        },
      });

      const mysqlConfig = result.api?.persistence?.mysql;
      expect(mysqlConfig?.url).toBe(
        "mysql://mysql_operator:mysql-secret@198.51.100.12:3306/eddie_agents"
      );
      expect(mysqlConfig?.ssl).toBe(true);
      expectTypeOf(mysqlConfig?.url).toEqualTypeOf<string | undefined>();
      expectTypeOf(mysqlConfig?.ssl).toEqualTypeOf<boolean | undefined>();
    });

    it("rejects non-numeric postgres connection ports", async () => {
      const service = new ConfigService();

      await expect(
        service.compose({
          api: {
            persistence: {
              driver: "postgres",
              postgres: {
                connection: {
                  host: "198.51.100.50",
                  port: "not-a-number" as unknown as number,
                  database: "eddie_agents",
                  user: "postgres_operator",
                  password: "pg-secret",
                },
              },
            },
          },
        })
      ).rejects.toThrow(
        "api.persistence.postgres.connection.port must be a number."
      );
    });
  });

  it("rejects mysql connection urls that are null", async () => {
    const service = new ConfigService();

    await expect(
      service.compose({
        api: {
          persistence: {
            driver: "mysql",
            mysql: {
              connection: {
                host: "198.51.100.12",
                port: 3306,
                database: "eddie_agents",
                user: "mysql_operator",
                password: "mysql-secret",
              },
              url: null,
            },
          },
        },
      })
    ).rejects.toThrow(
      "api.persistence.mysql.url must be a string when provided. Received null."
    );
  });

  describe("load", () => {
    it("reads configuration from the repository config directory", async () => {
      await fs.mkdir(repoConfigDir, { recursive: true });
      await fs.writeFile(
        repoConfigFile,
        "api:\n  host: 127.0.0.1\n  port: 4545\n",
        "utf-8"
      );

      const service = new ConfigService();

      const result = await service.load({});

      expect(result.api?.host).toBe("127.0.0.1");
      expect(result.api?.port).toBe(4545);
    });

    it("honors CONFIG_ROOT overrides when present", async () => {
      await fs.mkdir(overrideConfigDir, { recursive: true });
      await fs.writeFile(
        overrideConfigFile,
        "api:\n  host: 10.0.0.1\n  port: 9090\n",
        "utf-8"
      );
      process.env.CONFIG_ROOT = overrideConfigDir;

      const service = new ConfigService();

      const result = await service.load({});

      expect(result.api?.host).toBe("10.0.0.1");
      expect(result.api?.port).toBe(9090);
    });
  });
});
