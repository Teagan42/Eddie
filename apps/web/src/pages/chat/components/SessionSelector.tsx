import { Badge, Button, Flex, ScrollArea, Text } from '@radix-ui/themes';
import type { ChatSessionDto } from '@eddie/api-client';

export type SessionSelectorSession = Pick<ChatSessionDto, 'id' | 'title' | 'status'>;

export interface SessionSelectorProps {
  sessions: SessionSelectorSession[];
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onRenameSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onCreateSession: () => void;
  isCreatePending: boolean;
}

export function SessionSelector({
  sessions,
  selectedSessionId,
  onSelectSession,
  onRenameSession,
  onDeleteSession,
  onCreateSession,
  isCreatePending,
}: SessionSelectorProps): JSX.Element {
  void onRenameSession;
  void onDeleteSession;
  void onCreateSession;
  void isCreatePending;

  return (
    <ScrollArea type="always" className="mt-4 max-h-40">
      <Flex gap="2" wrap="wrap">
        {sessions.length === 0 ? (
          <Text size="2" color="gray">
            No sessions yet.
          </Text>
        ) : (
          sessions.map((session) => {
            const isSelected = session.id === selectedSessionId;

            return (
              <Button
                key={session.id}
                size="2"
                variant={isSelected ? 'solid' : 'soft'}
                color={isSelected ? 'jade' : 'gray'}
                onClick={() => onSelectSession(session.id)}
                aria-pressed={isSelected}
              >
                <Flex align="center" gap="2">
                  <span>{session.title}</span>
                  {session.status === 'archived' ? (
                    <Badge color="gray" variant="soft">
                      Archived
                    </Badge>
                  ) : null}
                </Flex>
              </Button>
            );
          })
        )}
      </Flex>
    </ScrollArea>
  );
}
