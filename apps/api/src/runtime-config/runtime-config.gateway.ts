import { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import {
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { Server } from "socket.io";
import { RuntimeConfigDto } from "./dto/runtime-config.dto";
import {
  RuntimeConfigListener,
  RuntimeConfigService,
} from "./runtime-config.service";

@WebSocketGateway({ namespace: "/config" })
export class RuntimeConfigGateway
  implements RuntimeConfigListener, OnModuleInit, OnModuleDestroy
{
  @WebSocketServer()
  private server!: Server;

  private unregister: (() => void) | null = null;

  constructor(private readonly config: RuntimeConfigService) {}

  onModuleInit(): void {
    if (!this.config || typeof this.config.registerListener !== "function") {
      return;
    }
    this.unregister = this.config.registerListener(this);
  }

  onModuleDestroy(): void {
    this.unregister?.();
    this.unregister = null;
  }

  onConfigChanged(config: RuntimeConfigDto): void {
    this.server.emit("config.updated", config);
  }
}
