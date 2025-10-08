import { Injectable } from "@nestjs/common";
import Ajv, { type ValidateFunction } from "ajv";
import type { ToolDefinition, ToolResult, ToolSchema } from "../types";

function formatErrors(validator: ValidateFunction | undefined): string | undefined {
  if (!validator || !validator.errors) return undefined;
  return validator.errors
    .map((err) => `${err.instancePath || "."} ${err.message ?? "invalid"}`.trim())
    .join(", ");
}

export class ToolRegistry {
  private readonly ajv: Ajv;
  private readonly toolResultValidator: ValidateFunction;
  private readonly tools = new Map<
    string,
    ToolDefinition & {
      inputValidator: ValidateFunction;
      outputValidator: ValidateFunction;
      dataValidator?: ValidateFunction;
      expectedSchemaId?: string;
    }
  >();

  constructor(definitions: ToolDefinition[] = []) {
    this.ajv = new Ajv({ allErrors: true, strict: false });
    this.toolResultValidator = this.ajv.compile({
      type: "object",
      additionalProperties: false,
      required: ["schema", "content"],
      properties: {
        schema: { type: "string", minLength: 1 },
        content: { type: "string" },
        data: {},
        metadata: {
          type: "object",
          additionalProperties: true,
        },
      },
    });

    for (const def of definitions) {
      this.register(def);
    }
  }

  register(definition: ToolDefinition): void {
    const inputValidator = this.ajv.compile(definition.jsonSchema) as ValidateFunction;

    let dataValidator: ValidateFunction | undefined;
    let expectedSchemaId: string | undefined;
    if (definition.outputSchema) {
      if (typeof (definition.outputSchema as { $id?: unknown }).$id !== "string") {
        throw new Error(
          `Tool ${definition.name} output schema must declare a string $id property for discrimination.`
        );
      }

      expectedSchemaId = (definition.outputSchema as { $id: string }).$id;
      dataValidator = this.ajv.compile(definition.outputSchema) as ValidateFunction;
    }

    const compiled: ToolDefinition & {
      inputValidator: ValidateFunction;
      outputValidator: ValidateFunction;
      dataValidator?: ValidateFunction;
      expectedSchemaId?: string;
    } = {
      ...definition,
      inputValidator,
      outputValidator: this.toolResultValidator,
      dataValidator,
      expectedSchemaId,
    };
    this.tools.set(definition.name, compiled);
  }

  unregister(name: string): void {
    this.tools.delete(name);
  }

  get(
    name: string
  ):
    | (ToolDefinition & {
        inputValidator: ValidateFunction;
        outputValidator: ValidateFunction;
        dataValidator?: ValidateFunction;
        expectedSchemaId?: string;
      })
    | undefined {
    return this.tools.get(name);
  }

  list(): (ToolDefinition & {
    inputValidator: ValidateFunction;
    outputValidator: ValidateFunction;
    dataValidator?: ValidateFunction;
    expectedSchemaId?: string;
  })[] {
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
  ): Promise<ToolResult> {
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

    if (!tool.inputValidator(parsedArgs)) {
      const errors = formatErrors(tool.inputValidator);
      throw new Error(`Validation failed for tool ${tool.name}: ${errors ?? "unknown error"}`);
    }

    const result = await tool.handler(parsedArgs, ctx);

    if (!tool.outputValidator(result)) {
      const errors = formatErrors(tool.outputValidator);
      throw new Error(
        `Output validation failed for tool ${tool.name}: ${errors ?? "unknown error"}`
      );
    }

    if (tool.expectedSchemaId && result.schema !== tool.expectedSchemaId) {
      throw new Error(
        `Output validation failed for tool ${tool.name}: expected schema ${tool.expectedSchemaId} but received ${result.schema}`
      );
    }

    if (tool.dataValidator) {
      if (result.data === undefined) {
        throw new Error(
          `Output validation failed for tool ${tool.name}: structured data missing for schema ${tool.expectedSchemaId}`
        );
      }

      if (!tool.dataValidator(result.data)) {
        const errors = formatErrors(tool.dataValidator);
        throw new Error(
          `Output validation failed for tool ${tool.name}: ${errors ?? "unknown error"}`
        );
      }
    }

    return result;
  }
}

@Injectable()
export class ToolRegistryFactory {
  create(definitions: ToolDefinition[] = []): ToolRegistry {
    return new ToolRegistry(definitions);
  }
}
