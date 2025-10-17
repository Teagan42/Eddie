import { ConfigStore } from "@eddie/config";
import { FactoryProvider } from "@nestjs/common";
import { Subscription } from "rxjs";
import { createTranscriptCompactor } from "../transcript-compactors";

type Teardown = () => void;

type SnapshotListener = () => void;

export interface TranscriptCompactorFactoryBinding {
  create: typeof createTranscriptCompactor;
  onSnapshot: (listener: SnapshotListener) => Teardown;
}

export const TRANSCRIPT_COMPACTOR_FACTORY = Symbol.for("TRANSCRIPT_COMPACTOR_FACTORY");

export const transcriptCompactorFactoryProvider: FactoryProvider<TranscriptCompactorFactoryBinding> = {
  provide: TRANSCRIPT_COMPACTOR_FACTORY,
  useFactory: (configStore: ConfigStore): TranscriptCompactorFactoryBinding => {
    return {
      create: createTranscriptCompactor,
      onSnapshot: (listener: SnapshotListener): Teardown => {
        const subscription: Subscription = configStore.changes$.subscribe(() => {
          listener();
        });

        return () => subscription.unsubscribe();
      },
    };
  },
  inject: [ConfigStore],
};

