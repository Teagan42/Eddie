import type { StreamEvent } from "../types";

interface NotificationRecord {
  payload: unknown;
  metadata?: Record<string, unknown>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  (isRecord(value) ? (value as Record<string, unknown>) : undefined);

const pushNotification = (
  collection: NotificationRecord[],
  payload: unknown,
  metadataCandidate: unknown,
  fallbackMetadata?: Record<string, unknown>
) => {
  const metadata = asRecord(metadataCandidate) ?? fallbackMetadata;
  collection.push({ payload, metadata });
};

export const extractNotificationEvents = (payload: unknown): StreamEvent[] => {
  const notifications: NotificationRecord[] = [];
  const seen = new Set<unknown>();

  const visit = (
    value: unknown,
    inheritedMetadata?: Record<string, unknown>
  ): void => {
    if (seen.has(value)) {
      return;
    }

    if (Array.isArray(value)) {
      seen.add(value);
      for (const entry of value) {
        visit(entry, inheritedMetadata);
      }
      return;
    }

    if (!isRecord(value)) {
      return;
    }

    seen.add(value);

    const metadata = asRecord(value.metadata) ?? inheritedMetadata;

    if ("notification" in value) {
      pushNotification(notifications, value.notification, value.metadata, metadata);
    }

    if (Array.isArray(value.notifications)) {
      for (const entry of value.notifications) {
        if (isRecord(entry) && "payload" in entry) {
          pushNotification(
            notifications,
            entry.payload,
            entry.metadata,
            metadata
          );
        } else {
          pushNotification(notifications, entry, undefined, metadata);
        }
      }
    }

    if (
      typeof value.type === "string" &&
      value.type.toLowerCase().includes("notification")
    ) {
      const { metadata: nodeMetadata, ...rest } = value;
      pushNotification(notifications, rest, nodeMetadata, metadata);
    }

    for (const [key, child] of Object.entries(value)) {
      if (key === "metadata") {
        continue;
      }
      visit(child, metadata);
    }
  };

  visit(payload);

  return notifications.map<StreamEvent>(({ payload: eventPayload, metadata }) => ({
    type: "notification",
    payload: eventPayload,
    metadata,
  }));
};
