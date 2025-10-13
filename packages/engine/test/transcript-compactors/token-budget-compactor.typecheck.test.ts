import { describe, expect, it } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, "../../");
const tsconfigPath = path.resolve(projectRoot, "tsconfig.build.json");
const barrelPath = path.resolve(projectRoot, "src/transcript-compactors/index.ts");

function parseTsConfig(configPath: string): ts.ParsedCommandLine {
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error) {
    throw new Error(
      ts.formatDiagnosticsWithColorAndContext([configFile.error], {
        getCurrentDirectory: ts.sys.getCurrentDirectory,
        getCanonicalFileName: (fileName) => fileName,
        getNewLine: () => ts.sys.newLine,
      }),
    );
  }

  return ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(configPath),
    undefined,
    configPath,
  );
}

describe("token budget compactor type exports", () => {
  it("compiles the barrel without re-export errors", () => {
    const parsedConfig = parseTsConfig(tsconfigPath);

    const program = ts.createProgram({
      rootNames: [barrelPath],
      options: parsedConfig.options,
    });
    const diagnostics = ts.getPreEmitDiagnostics(program);
    const reexportDiagnostics = diagnostics.filter((diagnostic) => {
      const text = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
      const fileName = diagnostic.file?.fileName ?? "";
      return (
        fileName.endsWith("transcript-compactors/index.ts") &&
        text.includes("TokenBudgetTranscriptCompactorConfig")
      );
    });

    expect(reexportDiagnostics).toHaveLength(0);
  });
});
