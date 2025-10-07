import { Module } from "@nestjs/common";
import { IoModule } from "../../io";
import { TemplateModule } from "../templates";
import { ContextService } from "./context.service";

@Module({
  imports: [IoModule, TemplateModule],
  providers: [ContextService],
  exports: [ContextService],
})
export class ContextModule {}
