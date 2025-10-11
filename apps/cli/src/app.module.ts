import {
  ConfigurableModuleBuilder,
  Module,
  type DynamicModule,
} from "@nestjs/common";
import { ConfigModule, type ConfigModuleOptions } from "@eddie/config";
import { ContextModule } from "@eddie/context";
import { EngineModule } from "@eddie/engine";
import { IoModule } from "@eddie/io";
import { CliModule } from "./cli/cli.module";

export type AppModuleOptions = ConfigModuleOptions;

const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN } =
  new ConfigurableModuleBuilder<AppModuleOptions>({
    moduleName: "EddieCliModule",
  }).build();

const resolveRuntimeOptions = (
  options?: AppModuleOptions,
): AppModuleOptions => options ?? {};

const appendConfigImport = <T extends { imports?: DynamicModule[] }>(
  dynamicModule: T,
  configImport: DynamicModule,
) => ({
  ...dynamicModule,
  imports: [...(dynamicModule.imports ?? []), configImport],
});

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
    options?: AppModuleOptions,
  ): ReturnType<typeof ConfigurableModuleClass["register"]> {
    const dynamicModule = super.register(options);
    const configImport = ConfigModule.register(
      resolveRuntimeOptions(options),
    );

    return appendConfigImport(dynamicModule, configImport);
  }

  static forRootAsync(
    options: Parameters<typeof ConfigurableModuleClass["registerAsync"]>[0],
  ): ReturnType<typeof ConfigurableModuleClass["registerAsync"]> {
    const dynamicModule = super.registerAsync(options);
    const configImport = ConfigModule.registerAsync({
      inject: [{ token: MODULE_OPTIONS_TOKEN, optional: true }],
      useFactory: async (moduleOptions?: AppModuleOptions) =>
        resolveRuntimeOptions(moduleOptions),
    });

    return appendConfigImport(dynamicModule, configImport);
  }
}
