import Ajv, { type ValidateFunction } from "ajv";
import type { ToolDefinition, ToolSchema } from "../types";

const ajv = new Ajv({ allErrors: true, strict: false });

function formatErrors(validator: ValidateFunction | undefined): string | undefined {
  if (!validator || !validator.errors) return undefined;
  return validator.errors
    .map((err) => `${err.instancePath || "."} ${err.message ?? "invalid"}`.trim())
    .join(", ");
}

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition & { validate?: ValidateFunction }>();

  constructor(definitions: ToolDefinition[] = []) {
    for (const def of definitions) {
      this.register(def);
    }
  }

  register(definition: ToolDefinition): void {
    const validator = ajv.compile(definition.jsonSchema) as ValidateFunction;
    const compiled: ToolDefinition & { validate: ValidateFunction } = {
      ...definition,
      validate: validator,
    };
    this.tools.set(definition.name, compiled);
  }

  unregister(name: string): void {
    this.tools.delete(name);
  }

  get(name: string): (ToolDefinition & { validate?: ValidateFunction }) | undefined {
    return this.tools.get(name);
  }

  list(): (ToolDefinition & { validate?: ValidateFunction })[] {
    return Array.from(this.tools.values());
  }

  schemas(): ToolSchema[] {
    return this.list().map((tool) => ({
      type: "function",
      name: tool.name,
      description: tool.description,
      parameters: tool.jsonSchema,
    }));
  }

  async execute(
    call: { name: string; arguments: unknown },
    ctx: Parameters<ToolDefinition["handler"]>[1]
  ): Promise<{ content: string; metadata?: Record<string, unknown> }> {
    const tool = this.tools.get(call.name);
    if (!tool) {
      throw new Error(`Unknown tool: ${call.name}`);
    }

    const args = typeof call.arguments === "string" ? call.arguments : call.arguments ?? {};

    let parsedArgs: Record<string, unknown> = {};
    if (typeof args === "string") {
      try {
        parsedArgs = JSON.parse(args);
      } catch {
        parsedArgs = { input: args };
      }
    } else {
      parsedArgs = args as Record<string, unknown>;
    }

    if (tool.validate && !tool.validate(parsedArgs)) {
      const errors = formatErrors(tool.validate);
      throw new Error(`Validation failed for tool ${tool.name}: ${errors ?? "unknown error"}`);
    }

    return tool.handler(parsedArgs, ctx);
  }
}
