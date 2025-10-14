import type { StreamOptions, ToolSchema } from "@eddie/types";

type ToolWithOutputSchema = ToolSchema & {
  outputSchema: NonNullable<ToolSchema["outputSchema"]>;
};

const hasOutputSchema = (tool: ToolSchema): tool is ToolWithOutputSchema =>
  Boolean(tool.outputSchema);

export const resolveResponseFormat = (
  options: StreamOptions,
): StreamOptions["responseFormat"] => {
  if (options.responseFormat) {
    return options.responseFormat;
  }

  return options.tools?.find(hasOutputSchema)?.outputSchema;
};
