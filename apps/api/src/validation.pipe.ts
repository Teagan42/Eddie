import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  OnModuleInit,
  PipeTransform,
  ValidationPipe,
  type ValidationPipeOptions,
} from "@nestjs/common";
import type { ValidationError } from "class-validator";
import type { CliRuntimeOptions, EddieConfig } from "@eddie/config";
import { ConfigService } from "@eddie/config";
import { LoggerService } from "@eddie/io";

@Injectable()
export class ApiValidationPipe implements PipeTransform, OnModuleInit {
  private delegate: ValidationPipe | null = null;
  private initPromise: Promise<void> | null = null;
  private readonly logger = this.loggerService.getLogger("api:validation");

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService
  ) {}

  async onModuleInit(): Promise<void> {
    this.initPromise = this.initialize();
    await this.initPromise;
  }

  private async initialize(): Promise<void> {
    const runtimeOptions: CliRuntimeOptions = {};
    const config: EddieConfig = await this.configService.load(runtimeOptions);
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

    this.delegate = new ValidationPipe(options);
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
