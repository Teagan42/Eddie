import { Injectable } from "@nestjs/common";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type {
  ToolDefinition,
  TypeScriptToolSourceConfig,
} from "@eddie/types";
import { tsImport } from "tsx/esm/api";

const DEFAULT_EXPORT_NAME = "tools" as const;
const LOADER_PARENT_URL = pathToFileURL(__filename).href;

export interface TypescriptToolSourceOptions {
  projectDir: string;
}

@Injectable()
export class TypescriptToolSourceService {
  async collectTools(
    sources: TypeScriptToolSourceConfig[] | undefined,
    options: TypescriptToolSourceOptions,
  ): Promise<ToolDefinition[]> {
    if (!sources?.length) {
      return [];
    }

    const definitions: ToolDefinition[] = [];
    for (const source of sources) {
      const sourceDefinitions = await this.loadSource(source, options.projectDir);
      definitions.push(...sourceDefinitions);
    }

    return definitions;
  }

  private async loadSource(
    source: TypeScriptToolSourceConfig,
    projectDir: string,
  ): Promise<ToolDefinition[]> {
    const exportName = source.exportName ?? DEFAULT_EXPORT_NAME;
    const definitions: ToolDefinition[] = [];

    for (const file of source.files) {
      const absolutePath = path.resolve(projectDir, file);
      const moduleUrl = pathToFileURL(absolutePath).href;
      let moduleExports: Record<string, unknown>;

      try {
        moduleExports = await tsImport(moduleUrl, {
          parentURL: LOADER_PARENT_URL,
          tsconfig: false,
        });
      } catch (error) {
        throw new Error(
          `Failed to load TypeScript tool module "${file}" for source "${source.id}": ${this.formatError(error)}`,
        );
      }

      let exported = moduleExports?.[exportName];
      if (typeof exported === "undefined") {
        const defaultExport = moduleExports?.default;
        if (defaultExport && typeof defaultExport === "object") {
          exported = (defaultExport as Record<string, unknown>)[exportName] ?? defaultExport;
        } else {
          exported = defaultExport;
        }
      }

      const normalized = this.normalizeDefinitions(exported);
      if (normalized.length === 0) {
        throw new Error(
          `TypeScript tool module "${file}" for source "${source.id}" did not export any tools via "${exportName}" or the default export.`,
        );
      }

      for (const definition of normalized) {
        this.assertToolDefinition(definition, file, source.id);
        definitions.push(definition);
      }
    }

    return definitions;
  }

  private normalizeDefinitions(exported: unknown): ToolDefinition[] {
    if (!exported) {
      return [];
    }

    if (Array.isArray(exported)) {
      return exported as ToolDefinition[];
    }

    return [exported as ToolDefinition];
  }

  private assertToolDefinition(
    definition: ToolDefinition,
    file: string,
    sourceId: string,
  ): void {
    if (!definition || typeof definition !== "object") {
      throw new Error(
        `Tool definition loaded from "${file}" for source "${sourceId}" must be an object.`,
      );
    }

    if (typeof definition.name !== "string" || definition.name.trim() === "") {
      throw new Error(
        `Tool definition loaded from "${file}" for source "${sourceId}" is missing a valid name.`,
      );
    }

    if (
      typeof definition.jsonSchema !== "object" ||
      definition.jsonSchema === null ||
      Array.isArray(definition.jsonSchema)
    ) {
      throw new Error(
        `Tool "${definition.name}" in "${file}" for source "${sourceId}" must provide a JSON schema object.`,
      );
    }

    if (typeof definition.handler !== "function") {
      throw new Error(
        `Tool "${definition.name}" in "${file}" for source "${sourceId}" must provide a handler function.`,
      );
    }
  }

  private formatError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return typeof error === "string" ? error : JSON.stringify(error);
  }
}
