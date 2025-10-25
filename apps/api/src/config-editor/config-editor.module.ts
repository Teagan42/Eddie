import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import { ConfigModule } from "@eddie/config";
import { ConfigEditorService } from "./config-editor.service";
import { ConfigEditorController } from "./config-editor.controller";
import { ConfigHotReloadService } from "./config-hot-reload.service";
import { RuntimeConfigModule } from "../runtime-config/runtime-config.module";

@Module({
  imports: [ConfigModule, CqrsModule, RuntimeConfigModule],
  providers: [ConfigEditorService, ConfigHotReloadService],
  controllers: [ConfigEditorController],
})
export class ConfigEditorModule {}
