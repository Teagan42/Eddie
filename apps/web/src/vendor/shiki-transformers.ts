type TransformerFactory = (options?: Record<string, unknown>) => {
  name: string;
  options?: Record<string, unknown>;
};

const createTransformer = (name: string): TransformerFactory => {
  return (options = {}) => ({
    name,
    options,
  });
};

const transformers = {
  transformerNotationDiff: createTransformer("transformer-notation-diff"),
  transformerNotationFocus: createTransformer("transformer-notation-focus"),
  transformerNotationHighlight: createTransformer(
    "transformer-notation-highlight",
  ),
} as const;

export const {
  transformerNotationDiff,
  transformerNotationFocus,
  transformerNotationHighlight,
} = transformers;
