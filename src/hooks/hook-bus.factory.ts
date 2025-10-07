import { Injectable } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import { HookBus } from "./hook-bus.service";

@Injectable()
export class HookBusFactory {
  constructor(private readonly moduleRef: ModuleRef) {}

  async create(): Promise<HookBus> {
    return this.moduleRef.create(HookBus);
  }
}
