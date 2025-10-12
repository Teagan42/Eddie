import 'reflect-metadata';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { ChatSessionsModule } from '../../../src/chat-sessions/chat-sessions.module';

describe('ChatSessionsModule', () => {
  it('imports the CQRS module without registering event payloads as providers', () => {
    const imports =
      Reflect.getMetadata(MODULE_METADATA.IMPORTS, ChatSessionsModule) ?? [];
    const providers =
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, ChatSessionsModule) ?? [];

    const importNames = imports.map((moduleRef: unknown) =>
      typeof moduleRef === 'function' ? moduleRef.name : undefined,
    );
    expect(importNames).toEqual(expect.arrayContaining(['CqrsModule']));
    const providerClassNames = providers
      .filter((provider: unknown): provider is Function => typeof provider === 'function')
      .map((provider) => provider.name);

    expect(providerClassNames).toEqual(
      expect.not.arrayContaining([
        'ChatSessionCreatedEvent',
        'ChatSessionUpdatedEvent',
        'ChatMessageCreatedEvent',
      ]),
    );
  });
});
