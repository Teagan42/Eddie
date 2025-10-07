import { Module } from "@nestjs/common";
import { IoModule } from "../../io/io.module";
import { TemplateModule } from "../templates/template.module";
import { ContextService } from "./context.service";

@Module({
  imports: [IoModule, TemplateModule],
  providers: [ContextService],
  exports: [ContextService],
})
export class ContextModule {}
