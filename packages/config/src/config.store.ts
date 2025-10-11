import { Inject, Injectable, Optional } from '@nestjs/common';
import { BehaviorSubject, Observable, distinctUntilChanged } from 'rxjs';
import { isDeepStrictEqual } from 'util';
import { DEFAULT_CONFIG } from './defaults';
import { INITIAL_CONFIG_TOKEN } from './config.const';
import type { EddieConfig } from './types';

@Injectable()
export class ConfigStore {
  private static snapshotsMatch(previous: EddieConfig, next: EddieConfig): boolean {
    return isDeepStrictEqual(previous, next);
  }

  private readonly subject: BehaviorSubject<EddieConfig>;

  readonly changes$: Observable<EddieConfig>;

  constructor(
    @Optional()
    @Inject(INITIAL_CONFIG_TOKEN)
    initialConfig?: EddieConfig,
  ) {
    const seed = initialConfig ?? structuredClone(DEFAULT_CONFIG);
    this.subject = new BehaviorSubject<EddieConfig>(structuredClone(seed));
    this.changes$ = this.subject
      .asObservable()
      .pipe(distinctUntilChanged(ConfigStore.snapshotsMatch));
  }

  setSnapshot(snapshot: EddieConfig): void {
    this.subject.next(structuredClone(snapshot));
  }

  getSnapshot(): EddieConfig {
    return structuredClone(this.subject.getValue());
  }
}
