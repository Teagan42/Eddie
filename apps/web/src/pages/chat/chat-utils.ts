import type { ChatMessageDto, ChatSessionDto } from "@eddie/api-client";

export function sortSessions(sessions: ChatSessionDto[]): ChatSessionDto[] {
  return sessions
    .slice()
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
}

export function upsertMessage(
  messages: ChatMessageDto[],
  next: ChatMessageDto
): ChatMessageDto[] {
  const exists = messages.some((message) => message.id === next.id);
  const collection = exists
    ? messages.map((message) =>
      message.id === next.id ? { ...message, ...next } : message
    )
    : [...messages, next];

  return collection.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

interface GraphemeSegment {
  segment: string;
}

interface GraphemeSegmenter {
  segment(value: string): IterableIterator<GraphemeSegment>;
}

type SegmenterConstructor = new (
  locales?: string | string[],
  options?: { granularity?: "grapheme" | "word" | "sentence" }
) => GraphemeSegmenter;

const SegmenterCtor: SegmenterConstructor | undefined =
  typeof Intl !== "undefined" && typeof (Intl as { Segmenter?: SegmenterConstructor }).Segmenter === "function"
    ? (Intl as { Segmenter: SegmenterConstructor }).Segmenter
    : undefined;

let graphemeSegmenter: GraphemeSegmenter | null | undefined;

function getSegmenter(): GraphemeSegmenter | null {
  if (graphemeSegmenter !== undefined) {
    return graphemeSegmenter;
  }

  graphemeSegmenter = SegmenterCtor
    ? new SegmenterCtor(undefined, { granularity: "grapheme" })
    : null;

  return graphemeSegmenter;
}

function splitGraphemes(value: string): string[] {
  if (!value) {
    return [];
  }

  const segmenter = getSegmenter();
  if (segmenter) {
    return Array.from(segmenter.segment(value), ({ segment }) => segment);
  }

  return Array.from(value);
}

function truncateUnicode(value: string, limit: number): { text: string; truncated: boolean } {
  if (!value) {
    return { text: "", truncated: false };
  }

  if (limit === 0) {
    return { text: "", truncated: value.length > 0 };
  }

  const graphemes = splitGraphemes(value);
  if (graphemes.length <= limit) {
    return { text: value, truncated: false };
  }

  return { text: graphemes.slice(0, limit).join(""), truncated: true };
}

export function summarizeObject(obj: unknown, maxLen = 200): string | null {
  try {
    if (obj == null) {
      return null;
    }

    const limit = normalizeLimit(maxLen);

    if (typeof obj === "string") {
      const { text, truncated } = truncateUnicode(obj, limit);
      return truncated ? `${text}…` : text;
    }

    const serialized = JSON.stringify(obj);
    const { text, truncated } = truncateUnicode(serialized, limit);
    return truncated ? `${text}…` : text;
  } catch {
    return null;
  }
}

function normalizeLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return 0;
  }

  return Math.max(0, Math.floor(limit));
}
