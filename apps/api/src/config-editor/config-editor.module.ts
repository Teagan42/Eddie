import { Module } from "@nestjs/common";
import { ConfigModule } from "@eddie/config";
import { ConfigEditorService } from "./config-editor.service";
import { ConfigEditorController } from "./config-editor.controller";
import { ConfigHotReloadService } from "./config-hot-reload.service";

@Module({
  imports: [ConfigModule],
  providers: [ConfigEditorService, ConfigHotReloadService],
  controllers: [ConfigEditorController],
})
export class ConfigEditorModule {}
