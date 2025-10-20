interface GraphemeSegment {
  segment: string;
}

interface GraphemeSegmenter {
  segment(value: string): IterableIterator<GraphemeSegment>;
}

type SegmenterConstructor = new (
  locales?: string | string[],
  options?: { granularity?: 'grapheme' | 'word' | 'sentence' },
) => GraphemeSegmenter;

const segmenterCandidate =
  typeof Intl !== 'undefined' && typeof (Intl as { Segmenter?: unknown }).Segmenter === 'function'
    ? (Intl as { Segmenter: unknown }).Segmenter
    : undefined;

const SegmenterCtor = segmenterCandidate as SegmenterConstructor | undefined;

let graphemeSegmenter: GraphemeSegmenter | null | undefined;

function getSegmenter(): GraphemeSegmenter | null {
  if (graphemeSegmenter !== undefined) {
    return graphemeSegmenter;
  }

  graphemeSegmenter = SegmenterCtor
    ? new SegmenterCtor(undefined, { granularity: 'grapheme' })
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
    return { text: '', truncated: false };
  }

  if (limit === 0) {
    return { text: '', truncated: value.length > 0 };
  }

  const graphemes = splitGraphemes(value);
  if (graphemes.length <= limit) {
    return { text: value, truncated: false };
  }

  return { text: graphemes.slice(0, limit).join(''), truncated: true };
}

function normalizeLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return 0;
  }

  return Math.max(0, Math.floor(limit));
}

export function summarizeObject(obj: unknown, maxLen = 200): string | null {
  try {
    if (obj == null) {
      return null;
    }

    const limit = normalizeLimit(maxLen);

    if (typeof obj === 'string') {
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
