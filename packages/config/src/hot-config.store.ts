import { Injectable } from "@nestjs/common";
import { BehaviorSubject, Observable } from "rxjs";

import { DEFAULT_CONFIG } from "./defaults";
import type { EddieConfig } from "./types";

@Injectable()
export class ConfigStore {
  private readonly subject = new BehaviorSubject<EddieConfig>(
    structuredClone(DEFAULT_CONFIG)
  );

  readonly changes$: Observable<EddieConfig> = this.subject.asObservable();

  setSnapshot(snapshot: EddieConfig): void {
    this.subject.next(structuredClone(snapshot));
  }

  getSnapshot(): EddieConfig {
    return structuredClone(this.subject.getValue());
  }
}
