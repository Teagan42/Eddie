import { Module } from "@nestjs/common";
import { IoModule } from "@eddie/io";
import { TemplateModule } from "@eddie/templates";
import { ContextService } from "./context.service";

@Module({
  imports: [IoModule, TemplateModule],
  providers: [ContextService],
  exports: [ContextService],
})
export class ContextModule {}
