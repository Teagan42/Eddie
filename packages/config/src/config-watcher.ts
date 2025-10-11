import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Subscription } from "rxjs";

import { ConfigService } from "./config.service";
import { ConfigStore } from "./hot-config.store";

@Injectable()
export class ConfigWatcher implements OnModuleInit, OnModuleDestroy {
  private subscription?: Subscription;

  constructor(
    private readonly configService: ConfigService,
    private readonly store: ConfigStore
  ) {}

  onModuleInit(): void {
    this.configService.bindStore(this.store);
    this.subscription = this.configService.writes$.subscribe((snapshot) => {
      if (snapshot.config) {
        this.store.setSnapshot(snapshot.config);
      }
    });
  }

  onModuleDestroy(): void {
    this.subscription?.unsubscribe();
    this.subscription = undefined;
  }
}
