import {
  ConfigurableModuleBuilder,
  Module,
  type DynamicModule,
  type Provider,
  type Type,
} from "@nestjs/common";
import { ConfirmService } from "./confirm.service";
import { JsonlWriterService } from "./jsonl-writer.service";
import { LoggerService } from "./logger.service";
import { StreamRendererService } from "./stream-renderer.service";
import { createLoggerProvider } from "./logger.decorator";

export interface IoModuleOptions {
  streamRendererClass?: Type<StreamRendererService>;
}

const rootLoggerProvider = createLoggerProvider();
const streamRendererProviderToken = Symbol.for("EDDIE_IO_STREAM_RENDERER");

const createStreamRendererImplementationProvider = (
  streamRendererClass: Type<StreamRendererService>
): Provider => ({
  provide: streamRendererProviderToken,
  useClass: streamRendererClass,
});

const streamRendererAliasProvider: Provider = {
  provide: StreamRendererService,
  useExisting: streamRendererProviderToken,
};

const createProviders = (
  streamRendererClass: Type<StreamRendererService>
): Provider[] => [
  LoggerService,
  ConfirmService,
  JsonlWriterService,
  createStreamRendererImplementationProvider(streamRendererClass),
  streamRendererAliasProvider,
  rootLoggerProvider,
];

const exportsList = [
  LoggerService,
  ConfirmService,
  JsonlWriterService,
  StreamRendererService,
  rootLoggerProvider.provide!,
];

const { ConfigurableModuleClass } =
  new ConfigurableModuleBuilder<IoModuleOptions>({
    moduleName: "IoModule",
  })
    .setExtras({ isGlobal: true }, (definition, extras) => ({
      ...definition,
      global: extras.isGlobal,
    }))
    .build();

const augmentModuleDefinition = (
  definition: DynamicModule,
  streamRendererClass: Type<StreamRendererService>
): DynamicModule => ({
  ...definition,
  providers: [
    ...(definition.providers ?? []),
    ...createProviders(streamRendererClass),
  ],
  exports: [...(definition.exports ?? []), ...exportsList],
});

@Module({
  providers: createProviders(StreamRendererService),
  exports: exportsList,
})
export class IoModule extends ConfigurableModuleClass {
  static override register(options: IoModuleOptions = {}): DynamicModule {
    const streamRendererClass =
      options.streamRendererClass ?? StreamRendererService;
    const definition = super.register(options);

    return augmentModuleDefinition(definition, streamRendererClass);
  }
}
