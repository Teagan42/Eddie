import { Injectable, OnModuleDestroy, Optional } from "@nestjs/common";
import { Subscription } from "rxjs";

import type { ConfigFileSnapshot } from "./config.service";
import { ConfigService } from "./config.service";
import { ConfigStore } from "./hot-config.store";

@Injectable()
export class ConfigWatcher implements OnModuleDestroy {
  private subscription?: Subscription;

  constructor(
    @Optional() private readonly configService?: ConfigService,
    @Optional() private readonly store?: ConfigStore
  ) {
    if (!this.configService || !this.store) {
      return;
    }

    const writes$ = this.configService.writes$;

    if (!writes$) {
      return;
    }

    this.subscription = writes$.subscribe(
      (snapshot: ConfigFileSnapshot) => {
        if (snapshot.config) {
          this.store.setSnapshot(snapshot.config);
        }
      }
    );
  }

  onModuleDestroy(): void {
    this.subscription?.unsubscribe();
  }
}
