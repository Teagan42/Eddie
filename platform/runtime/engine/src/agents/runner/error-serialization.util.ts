export interface SerializedError extends Record<string, unknown> {
  message: string;
  stack?: string;
  cause?: unknown;
}

export const serializeError = (error: unknown): SerializedError => {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
      cause: (error as { cause?: unknown }).cause,
    };
  }

  return { message: String(error) };
};
