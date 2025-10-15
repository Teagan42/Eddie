import {
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Server } from "ws";
import { emitEvent } from "../websocket/utils";
import { RuntimeConfigDto } from "./dto/runtime-config.dto";

@WebSocketGateway({
  path: "/config",
})
export class RuntimeConfigGateway {
  @WebSocketServer()
  private server!: Server;

  emitConfigUpdated(config: RuntimeConfigDto): void {
    emitEvent(this.server, "config.updated", config);
  }
}
