import { Module } from "@nestjs/common";
import { ConfigModule } from "@eddie/config";
import { ConfigEditorService } from "./config-editor.service";
import { ConfigEditorController } from "./config-editor.controller";

@Module({
  imports: [ConfigModule],
  providers: [ConfigEditorService],
  controllers: [ConfigEditorController],
})
export class ConfigEditorModule {}
