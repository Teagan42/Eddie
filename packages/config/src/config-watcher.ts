import { Inject, Injectable, OnModuleDestroy, Optional, forwardRef } from "@nestjs/common";
import { Subscription } from "rxjs";

import type { ConfigFileSnapshot } from "./config.service";
import { ConfigService } from "./config.service";
import { ConfigStore } from './config.store';

@Injectable()
export class ConfigWatcher implements OnModuleDestroy {
  private subscription?: Subscription;

  constructor(
    @Inject(forwardRef(() => ConfigService)) private readonly configService: ConfigService,
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
