import type { ChangeEvent, FormEvent } from 'react';

import type { ChatMessageDto } from '@eddie/api-client';

export interface ChatWindowProps {
  messages: ChatMessageDto[];
  composerValue: string;
  onComposerChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onComposerSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onReissueCommand: (message: ChatMessageDto) => void;
  composerSubmitDisabled?: boolean;
}

function renderMessageContent(content: ChatMessageDto['content']): string {
  if (typeof content === 'string') {
    return content;
  }

  return JSON.stringify(content);
}

export function ChatWindow({
  messages,
  composerValue,
  onComposerChange,
  onComposerSubmit,
  onReissueCommand,
  composerSubmitDisabled = false,
}: ChatWindowProps): JSX.Element {
  return (
    <div>
      <div role="log">
        <ul>
          {messages.map((message) => {
            const messageContent = renderMessageContent(message.content);

            return (
              <li key={message.id}>
                <div>
                  <p>{messageContent}</p>
                  {message.role !== 'assistant' ? (
                    <button
                      type="button"
                      onClick={() => onReissueCommand(message)}
                      aria-label={`Re-issue command ${messageContent}`}
                    >
                      Re-issue command
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
        <div data-testid="chat-scroll-anchor" aria-hidden="true" />
      </div>
      <form
        aria-label="Composer"
        onSubmit={(event) => {
          event.preventDefault();
          onComposerSubmit(event);
        }}
      >
        <textarea
          value={composerValue}
          onChange={onComposerChange}
          aria-label="Chat composer"
        />
        <button type="submit" disabled={composerSubmitDisabled}>
          Send
        </button>
      </form>
    </div>
  );
}
