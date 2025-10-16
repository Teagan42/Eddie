import { Module } from "@nestjs/common";
import { HookBusFactory } from "./hook-bus.factory";
import { HooksLoaderService } from "./hooks-loader.service";
import { HooksService } from "./hooks.service";

@Module({
  providers: [HookBusFactory, HooksLoaderService, HooksService],
  exports: [HooksService],
})
export class HooksModule {}
