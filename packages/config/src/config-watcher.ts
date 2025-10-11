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
    const injectedStore = this.store;
    const writes$ = this.configService?.writes$;

    if (!injectedStore || !writes$) {
      return;
    }

    this.subscription = writes$.subscribe(
      (snapshot: ConfigFileSnapshot) => {
        const config = snapshot.config;

        if (config) {
          injectedStore.setSnapshot(config);
        }
      }
    );
  }

  onModuleDestroy(): void {
    this.subscription?.unsubscribe();
  }
}
