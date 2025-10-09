import {
  CanActivate,
  ExecutionContext,
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { Reflector } from "@nestjs/core";
import { ConfigService } from "@eddie/config";
import type { CliRuntimeOptions, EddieConfig } from "@eddie/config";
import { ContextService } from "@eddie/context";
import { InjectLogger } from "@eddie/io";
import type { Logger } from "pino";
import { IS_PUBLIC_KEY } from "./public.decorator";

interface ContextSummary {
  files: number;
  totalBytes: number;
}

@Injectable()
export class ApiKeyGuard implements CanActivate, OnModuleInit {
  private enabled = false;
  private apiKeys = new Set<string>();
  private initPromise: Promise<void> | null = null;
  private contextSummary: ContextSummary | null = null;

  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
    private readonly contextService: ContextService,
    @InjectLogger("api:auth") private readonly logger: Logger
  ) {}

  async onModuleInit(): Promise<void> {
    this.initPromise = this.initialize();
    await this.initPromise;
  }

  private normalizeKeys(source: unknown): string[] {
    if (!source) {
      return [];
    }

    if (Array.isArray(source)) {
      return source.map((value) => String(value).trim()).filter(Boolean);
    }

    if (typeof source === "string") {
      return source
        .split(/[,\s]+/u)
        .map((value) => value.trim())
        .filter(Boolean);
    }

    return [];
  }

  private async initialize(): Promise<void> {
    const runtimeOptions: CliRuntimeOptions = {};
    const config: EddieConfig = await this.configService.load(runtimeOptions);
    const authConfig = config.api?.auth;

    this.enabled = authConfig?.enabled ?? false;

    const configuredKeys = this.normalizeKeys(authConfig?.apiKeys);
    const envKeys = this.normalizeKeys(process.env.EDDIE_API_KEYS);
    const singleEnvKey = process.env.EDDIE_API_KEY;
    if (singleEnvKey) {
      envKeys.push(singleEnvKey.trim());
    }

    const contextKeys = this.normalizeKeys(
      config.context.variables?.apiKeys ?? config.context.variables?.API_KEYS
    );

    this.apiKeys = new Set<string>([
      ...configuredKeys,
      ...envKeys,
      ...contextKeys,
    ]);

    const keySources = {
      configured: Boolean(authConfig?.apiKeys),
      environment: Boolean(
        process.env.EDDIE_API_KEYS ?? process.env.EDDIE_API_KEY
      ),
      context: Boolean(
        config.context.variables?.apiKeys ??
          config.context.variables?.API_KEYS
      ),
    };

    this.logger.info(
      {
        enabled: this.enabled,
        keySources,
      },
      "API key guard initialised"
    );

    try {
      const packed = await this.contextService.pack(config.context);
      this.contextSummary = {
        files: packed.files.length,
        totalBytes: packed.totalBytes,
      };
    } catch (error) {
      this.logger.debug(
        { error },
        "Failed to compute context summary for auth guard logs"
      );
    }
  }

  private async ensureInitialised(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    this.initPromise = this.initialize();
    await this.initPromise;
  }

  private extractApiKey(request: Request): string | null {
    const headerKey = request.get("x-api-key") ?? request.get("api-key");
    if (headerKey?.trim()) {
      return headerKey.trim();
    }

    const authHeader = request.get("authorization");
    if (authHeader?.toLowerCase().startsWith("bearer ")) {
      return authHeader.slice(7).trim() || null;
    }

    const queryKey = request.query?.apiKey ?? request.query?.api_key;
    if (typeof queryKey === "string" && queryKey.trim()) {
      return queryKey.trim();
    }

    return null;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== "http") {
      return true;
    }

    await this.ensureInitialised();

    if (!this.enabled) {
      return true;
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const apiKey = this.extractApiKey(request);

    if (apiKey && this.apiKeys.has(apiKey)) {
      (request as Request & { apiKey?: string }).apiKey = apiKey;
      return true;
    }

    this.logger.warn(
      {
        method: request.method,
        path: request.originalUrl ?? request.url,
        presented: Boolean(apiKey),
        context: this.contextSummary,
      },
      "Rejected unauthenticated request"
    );

    throw new UnauthorizedException("Invalid or missing API key");
  }
}
