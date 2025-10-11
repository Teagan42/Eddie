import { ConfigurableModuleBuilder, Module } from "@nestjs/common";
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

@Module({
  imports: [
    ConfigModule.registerAsync({
      inject: [{ token: MODULE_OPTIONS_TOKEN, optional: true }],
      useFactory: async (options?: AppModuleOptions) =>
        resolveRuntimeOptions(options),
    }),
    ContextModule,
    IoModule,
    EngineModule,
    CliModule,
  ],
})
export class AppModule extends ConfigurableModuleClass {}
