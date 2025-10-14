import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import type { Request } from "express";
import {
  Observable,
  Subscription,
  catchError,
  defer,
  of,
  switchMap,
  tap,
} from "rxjs";
import { createHash, pbkdf2Sync } from "node:crypto";
import { ConfigService, ConfigStore } from "@eddie/config";
import type { EddieConfig } from "@eddie/config";
import { ContextService } from "@eddie/context";
import { InjectLogger } from "@eddie/io";
import type { Logger } from "pino";

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

@Injectable()
export class ApiCacheInterceptor implements NestInterceptor, OnModuleInit, OnModuleDestroy {
  private readonly cache = new Map<string, CacheEntry>();
  private enabled = true;
  private ttlMs = 0;
  private maxItems = 0;
  private contextFingerprint = "";
  private authEnabled = false;
  private initPromise: Promise<void> | null = null;
  private subscription: Subscription | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly configStore: ConfigStore,
    private readonly contextService: ContextService,
    @InjectLogger("api:cache") private readonly logger: Logger
  ) {}

  async onModuleInit(): Promise<void> {
    this.initPromise = this.initialize();
    await this.initPromise;
  }

  onModuleDestroy(): void {
    this.subscription?.unsubscribe();
    this.subscription = null;
  }

  private async initialize(): Promise<void> {
    await this.applySnapshot(this.configStore.getSnapshot());

    this.ensureSubscription();
  }

  private ensureSubscription(): void {
    if (this.subscription) {
      return;
    }

    this.subscription = this.configStore.changes$.subscribe((config) => {
      void this.applySnapshot(config);
    });
  }

  private async applySnapshot(config: EddieConfig): Promise<void> {
    const cacheConfig = config.api?.cache ?? {};

    this.enabled = cacheConfig.enabled ?? true;
    this.ttlMs = Math.max(0, (cacheConfig.ttlSeconds ?? 5) * 1000);
    this.maxItems = Math.max(0, cacheConfig.maxItems ?? 128);
    this.authEnabled = config.api?.auth?.enabled ?? false;

    try {
      const stats = await this.contextService.computeStats(config.context);
      this.contextFingerprint = this.buildContextFingerprint(stats);
    } catch (error) {
      this.logger.debug(
        { error },
        "Unable to compute context fingerprint for cache key generation"
      );
      this.contextFingerprint = createHash("sha1")
        .update(JSON.stringify(config.context))
        .digest("hex");
    }

    this.cache.clear();
  }

  private buildContextFingerprint(stats: {
    fileCount: number;
    totalBytes: number;
  }): string {
    return createHash("sha1")
      .update(String(stats.fileCount))
      .update(":")
      .update(String(stats.totalBytes))
      .digest("hex");
  }

  private async ensureInitialised(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    this.initPromise = this.initialize();
    await this.initPromise;
  }

  private prune(): void {
    const now = Date.now();

    if (this.ttlMs > 0) {
      for (const [key, entry] of this.cache.entries()) {
        if (entry.expiresAt <= now) {
          this.cache.delete(key);
        }
      }
    }

    while (this.maxItems > 0 && this.cache.size > this.maxItems) {
      const oldestKey = this.cache.keys().next().value as string | undefined;
      if (!oldestKey) {
        break;
      }
      this.cache.delete(oldestKey);
    }
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

  private createCacheKey(request: Request): string {
    const hash = createHash("sha1");
    hash.update(request.method.toUpperCase());
    hash.update("::");
    hash.update(request.originalUrl ?? request.url);

    if (request.headers.accept) {
      hash.update("::accept=");
      hash.update(String(request.headers.accept));
    }

    if (request.headers["accept-encoding"]) {
      hash.update("::encoding=");
      hash.update(String(request.headers["accept-encoding"]));
    }

    hash.update("::ctx=");
    hash.update(this.contextFingerprint);

    if (this.authEnabled) {
      const apiKey = this.extractApiKey(request);
      hash.update("::key=");

      if (apiKey) {
        hash.update(pbkdf2Sync(apiKey, "eddie-api-cache", 100000, 32, "sha256").toString("hex"));
      } else {
        hash.update("anon");
      }
    }

    return hash.digest("hex");
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();

    return defer(() => this.ensureInitialised()).pipe(
      catchError((error) => {
        this.logger.error(
          { error },
          "Failed to initialise cache interceptor configuration"
        );
        return of(null);
      }),
      switchMap(() => {
        if (!this.enabled) {
          return next.handle();
        }

        if (request.method !== "GET") {
          return next.handle();
        }

        this.prune();

        const cacheKey = this.createCacheKey(request);
        const entry = this.cache.get(cacheKey);
        const now = Date.now();

        if (entry && (this.ttlMs === 0 || entry.expiresAt > now)) {
          this.logger.debug({ cacheKey }, "Serving response from cache");
          return of(entry.value);
        }

        this.logger.debug({ cacheKey }, "Caching fresh response");

        return next.handle().pipe(
          tap((value) => {
            const expiresAt =
              this.ttlMs > 0 ? Date.now() + this.ttlMs : Number.POSITIVE_INFINITY;
            this.cache.set(cacheKey, { value, expiresAt });
            this.prune();
          })
        );
      })
    );
  }
}
