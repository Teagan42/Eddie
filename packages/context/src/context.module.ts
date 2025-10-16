import { Module } from "@nestjs/common";
import { IoModule } from "@eddie/io";
import { TemplateModule } from "@eddie/templates";
import { templateRuntimeProviders } from "@eddie/engine/templating";
import { ContextService } from "./context.service";

@Module({
  imports: [IoModule, TemplateModule],
  providers: [...templateRuntimeProviders, ContextService],
  exports: [ContextService],
})
export class ContextModule {}
