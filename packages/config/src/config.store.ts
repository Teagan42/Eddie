import { Injectable } from '@nestjs/common';
import { BehaviorSubject, Observable, distinctUntilChanged } from 'rxjs';
import { isDeepStrictEqual } from 'util';
import { DEFAULT_CONFIG } from './defaults';
import type { EddieConfig } from './types';

@Injectable()
export class ConfigStore {
  private static snapshotsMatch(previous: EddieConfig, next: EddieConfig): boolean {
    return isDeepStrictEqual(previous, next);
  }

  private readonly subject = new BehaviorSubject<EddieConfig>(
    structuredClone(DEFAULT_CONFIG)
  );

  readonly changes$: Observable<EddieConfig> = this.subject
    .asObservable()
    .pipe(distinctUntilChanged(ConfigStore.snapshotsMatch));

  setSnapshot(snapshot: EddieConfig): void {
    this.subject.next(structuredClone(snapshot));
  }

  getSnapshot(): EddieConfig {
    return structuredClone(this.subject.getValue());
  }
}
