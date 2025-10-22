import { createElement } from "react";

const MonacoEditor = () =>
  createElement("div", { "data-testid": "monaco-editor" });
const MonacoDiffEditor = () =>
  createElement("div", { "data-testid": "monaco-diff-editor" });

export function createMonacoModuleStub() {
  return {
    __esModule: true as const,
    default: MonacoEditor,
    Editor: MonacoEditor,
    DiffEditor: MonacoDiffEditor,
    useMonaco: () => null,
  };
}
