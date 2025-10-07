import { Module } from "@nestjs/common";
import { IoModule } from "../../io/io.module";
import { ContextService } from "./packer";

@Module({
  imports: [IoModule],
  providers: [ContextService],
  exports: [ContextService],
})
export class ContextModule {}
