import {
  ConfigurableModuleBuilder,
  Module,
  type DynamicModule,
} from "@nestjs/common";
import {
  ConfigModule,
  type CliRuntimeOptions,
} from "@eddie/config";
import { ContextModule } from "@eddie/context";
import { EngineModule } from "@eddie/engine";
import { IoModule } from "@eddie/io";
import { CliModule } from "./cli/cli.module";

const { ConfigurableModuleClass } =
  new ConfigurableModuleBuilder<CliRuntimeOptions>({
    moduleName: "EddieCliModule",
  }).build();

@Module({
  imports: [
    ContextModule,
    IoModule,
    EngineModule,
    CliModule,
  ],
})
export class AppModule extends ConfigurableModuleClass {
  static forRoot(
    options: CliRuntimeOptions,
  ): DynamicModule {
    const dynamicModule = super.register(options);
    return {
      ...dynamicModule,
      imports: [
        ...(dynamicModule.imports ?? []),
        ConfigModule.register(options),
      ],
    };
  }

  static forRootAsync(
    options: Parameters<typeof ConfigurableModuleClass["registerAsync"]>[0],
  ): DynamicModule {
    const dynamicModule = super.register(options);
    return {
      ...dynamicModule,
      imports: [
        ...(dynamicModule.imports ?? []),
        ConfigModule.registerAsync(options),
      ],
    };
  }
}
