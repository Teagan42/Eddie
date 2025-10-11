import 'reflect-metadata';
import { MODULE_METADATA } from '@nestjs/common/constants';
import {
  ChatMessageCreatedEvent,
  ChatSessionCreatedEvent,
  ChatSessionUpdatedEvent,
} from '@eddie/types';
import { ChatSessionsModule } from '../../../src/chat-sessions/chat-sessions.module';

describe('ChatSessionsModule', () => {
  it('registers CQRS events for chat sessions', () => {
    const imports =
      Reflect.getMetadata(MODULE_METADATA.IMPORTS, ChatSessionsModule) ?? [];
    const providers =
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, ChatSessionsModule) ?? [];

    const importNames = imports.map((moduleRef: unknown) =>
      typeof moduleRef === 'function' ? moduleRef.name : undefined,
    );
    expect(importNames).toEqual(expect.arrayContaining(['CqrsModule']));
    expect(providers).toEqual(
      expect.arrayContaining([
        ChatSessionCreatedEvent,
        ChatSessionUpdatedEvent,
        ChatMessageCreatedEvent,
      ]),
    );
  });
});
