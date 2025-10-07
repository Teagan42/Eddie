import { Module } from "@nestjs/common";
import { IoModule } from "../../io";
import { ContextService } from "./context.service";

@Module({
  imports: [IoModule],
  providers: [ContextService],
  exports: [ContextService],
})
export class ContextModule {}
