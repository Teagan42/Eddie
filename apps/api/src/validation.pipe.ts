import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  PipeTransform,
  ValidationPipe,
  type ValidationPipeOptions,
} from "@nestjs/common";
import type { ValidationError } from "class-validator";
import type { EddieConfig } from "@eddie/config";
import { ConfigService, ConfigStore } from "@eddie/config";
import { InjectLogger } from "@eddie/io";
import type { Logger } from "pino";
import { Subscription } from "rxjs";

@Injectable()
export class ApiValidationPipe implements PipeTransform, OnModuleInit, OnModuleDestroy {
  private delegate: ValidationPipe | null = null;
  private initPromise: Promise<void> | null = null;
  private subscription: Subscription | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly configStore: ConfigStore,
    @InjectLogger("api:validation") private readonly logger: Logger
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
    this.delegate = this.createValidationPipe(this.configStore.getSnapshot());

    this.ensureSubscription();
  }

  private ensureSubscription(): void {
    if (this.subscription) {
      return;
    }

    this.subscription = this.configStore.changes$.subscribe((config) => {
      this.delegate = this.createValidationPipe(config);
    });
  }

  private createValidationPipe(config: EddieConfig): ValidationPipe {
    const validation = config.api?.validation ?? {};

    const options: ValidationPipeOptions = {
      whitelist: validation.whitelist ?? true,
      forbidNonWhitelisted: validation.forbidNonWhitelisted ?? false,
      transform: validation.transform ?? true,
      transformOptions: {
        enableImplicitConversion: validation.enableImplicitConversion ?? true,
      },
      validationError: {
        target: false,
        value: false,
      },
      exceptionFactory: (errors: ValidationError[]) => {
        const flattened = errors.map((error) => ({
          property: error.property,
          constraints: error.constraints,
        }));
        this.logger.warn({ errors: flattened }, "Request validation failed");
        return new BadRequestException({
          message: "Validation failed",
          errors: flattened,
        });
      },
    };

    return new ValidationPipe(options);
  }

  private async ensureInitialised(): Promise<void> {
    if (this.delegate) {
      return;
    }

    if (!this.initPromise) {
      this.initPromise = this.initialize();
    }

    await this.initPromise;
  }

  async transform<T = unknown>(
    value: T,
    metadata: ArgumentMetadata
  ): Promise<T> {
    await this.ensureInitialised();

    if (!this.delegate) {
      return value;
    }

    try {
      return (await this.delegate.transform(value, metadata)) as T;
    } catch (error) {
      this.logger.warn(
        {
          type: metadata.type,
          data: metadata.data,
          metatype: metadata.metatype?.name,
          message: error instanceof Error ? error.message : String(error),
        },
        "Validation pipeline rejected request"
      );
      throw error;
    }
  }
}
