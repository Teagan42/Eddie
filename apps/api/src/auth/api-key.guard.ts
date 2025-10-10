import {
  CanActivate,
  ExecutionContext,
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ConfigService } from "@eddie/config";
import type { CliRuntimeOptions, EddieConfig } from "@eddie/config";
import { ContextService } from "@eddie/context";
import { InjectLogger } from "@eddie/io";
import type { Logger } from "pino";
import { IS_PUBLIC_KEY } from "./public.decorator";
import type { Request } from "express";

interface ContextSummary {
  files: number;
  totalBytes: number;
}

interface ApiKeyLookup {
  getHeader(name: string): string | undefined;
  getQuery(name: string): unknown;
}

interface WebSocketClient {
  handshake?: {
    headers?: Record<string, unknown>;
    query?: Record<string, unknown>;
    url?: string;
  };
  [key: string]: unknown;
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

  private extractApiKeyFromLookup(lookup: ApiKeyLookup): string | null {
    const headerKey = lookup.getHeader("x-api-key") ?? lookup.getHeader("api-key");
    if (headerKey?.trim()) {
      return headerKey.trim();
    }

    const authHeader = lookup.getHeader("authorization");
    if (authHeader?.toLowerCase().startsWith("bearer ")) {
      return authHeader.slice(7).trim() || null;
    }

    const queryKey = lookup.getQuery("apiKey") ?? lookup.getQuery("api_key");
    if (typeof queryKey === "string" && queryKey.trim()) {
      return queryKey.trim();
    }

    return null;
  }

  private rejectRequest(details: {
    method: string;
    path?: string | null;
    presented: boolean;
  }): never {
    this.logger.warn(
      {
        ...details,
        context: this.contextSummary,
      },
      "Rejected unauthenticated request"
    );

    throw new UnauthorizedException("Invalid or missing API key");
  }

  private extractApiKeyFromRequest(request: Request): string | null {
    return this.extractApiKeyFromLookup({
      getHeader: (name) => request.get(name) ?? undefined,
      getQuery: (name) => request.query?.[name as keyof typeof request.query],
    });
  }

  private extractApiKeyFromWebSocket(client: WebSocketClient): string | null {
    const headers = client.handshake?.headers ?? {};
    const query = client.handshake?.query ?? {};

    const normaliseHeader = (name: string): string | undefined => {
      const lowered = name.toLowerCase();
      const direct = headers[name];
      const value = direct ?? headers[lowered] ?? headers[name.toUpperCase()];

      if (Array.isArray(value)) {
        return value.find((item) => typeof item === "string") as string | undefined;
      }

      if (typeof value === "string") {
        return value;
      }

      if (value != null) {
        return String(value);
      }

      return undefined;
    };

    return this.extractApiKeyFromLookup({
      getHeader: normaliseHeader,
      getQuery: (name) => query[name],
    });
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const type = context.getType();
    if (type !== "http" && type !== "ws") {
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

    if (type === "http") {
      const request = context.switchToHttp().getRequest<Request>();
      const apiKey = this.extractApiKeyFromRequest(request);

      if (apiKey && this.apiKeys.has(apiKey)) {
        (request as Request & { apiKey?: string }).apiKey = apiKey;
        return true;
      }

      this.rejectRequest({
        method: request.method,
        path: request.originalUrl ?? request.url,
        presented: Boolean(apiKey),
      });
    }

    const client = context.switchToWs().getClient<WebSocketClient>();
    const apiKey = this.extractApiKeyFromWebSocket(client);

    if (apiKey && this.apiKeys.has(apiKey)) {
      (client as WebSocketClient & { apiKey?: string }).apiKey = apiKey;
      return true;
    }

    this.rejectRequest({
      method: "WS",
      path: client.handshake?.url,
      presented: Boolean(apiKey),
    });
  }
}
