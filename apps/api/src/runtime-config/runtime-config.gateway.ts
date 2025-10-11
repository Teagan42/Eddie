import { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import {
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Server } from "ws";
import { Subscription } from "rxjs";
import { emitEvent } from "../websocket/utils";
import { RuntimeConfigDto } from "./dto/runtime-config.dto";
import { RuntimeConfigService } from "./runtime-config.service";

@WebSocketGateway({
  path: "/config",
})
export class RuntimeConfigGateway implements OnModuleInit, OnModuleDestroy {
  @WebSocketServer()
  private server!: Server;

  private subscription: Subscription | null = null;

  constructor(private readonly config: RuntimeConfigService) {}

  onModuleInit(): void {
    this.subscription = this.config.changes$.subscribe((config) => {
      this.onConfigChanged(config);
    });
  }

  onModuleDestroy(): void {
    this.subscription?.unsubscribe();
    this.subscription = null;
  }

  onConfigChanged(config: RuntimeConfigDto): void {
    emitEvent(this.server, "config.updated", config);
  }
}
