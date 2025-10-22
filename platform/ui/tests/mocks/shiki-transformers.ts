export type Transformer = (options?: Record<string, unknown>) => Record<string, unknown>;

function createTransformer(name: string): Transformer {
  return (options = {}) => Object.freeze({ name, options });
}

export const transformerNotationDiff = createTransformer("transformerNotationDiff");
export const transformerNotationFocus = createTransformer("transformerNotationFocus");
export const transformerNotationHighlight = createTransformer("transformerNotationHighlight");
