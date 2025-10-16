import { Module } from "@nestjs/common";
import { IoModule } from "@eddie/io";
import { TemplateModule, templateRuntimeProviders } from "@eddie/templates";
import { ContextService } from "./context.service";

@Module({
  imports: [IoModule, TemplateModule],
  providers: [...templateRuntimeProviders, ContextService],
  exports: [ContextService],
})
export class ContextModule {}
