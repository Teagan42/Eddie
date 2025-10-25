import { Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import Ajv, { type ErrorObject, type ValidateFunction } from "ajv";
import type { ToolDefinition, ToolResult, ToolSchema } from "@eddie/types";

type ValidationContext = "arguments" | "result" | "resultData";

const VALIDATION_CONTEXT_DETAILS: Record<
  ValidationContext,
  { subject: string; prefix?: string; rootField: string }
> = {
  arguments: { subject: "tool arguments", rootField: "arguments" },
  result: { subject: "tool result", prefix: "result", rootField: "result" },
  resultData: { subject: "tool result data", prefix: "data", rootField: "data" },
};

type ValidationContextDetail = (typeof VALIDATION_CONTEXT_DETAILS)[ValidationContext];

function getParamString(error: ErrorObject, key: string): string | undefined {
  if (!error.params || typeof error.params !== "object") {
    return undefined;
  }

  const value = (error.params as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function appendPath(
  parent: string | undefined,
  segment: string | undefined,
): string | undefined {
  if (!segment || segment.length === 0) {
    return parent;
  }

  if (!parent || parent.length === 0) {
    return segment;
  }

  return `${parent}.${segment}`;
}

function decodeJsonPointerSegment(segment: string): string {
  return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}

function normalizeInstancePath(instancePath: string): string | undefined {
  if (!instancePath) {
    return undefined;
  }

  const segments = instancePath
    .split("/")
    .filter((segment) => segment.length > 0)
    .map(decodeJsonPointerSegment);

  return segments.length > 0 ? segments.join(".") : undefined;
}

function applyContextPrefix(field: string | undefined, detail: ValidationContextDetail): string {
  if (!field || field.length === 0) {
    return detail.rootField;
  }

  if (!detail.prefix) {
    return field;
  }

  if (field === detail.prefix || field.startsWith(`${detail.prefix}.`)) {
    return field;
  }

  return `${detail.prefix}.${field}`;
}

function describeLocation(parentPath: string | undefined, detail: ValidationContextDetail): string {
  if (!parentPath) {
    return `the ${detail.subject}`;
  }

  const normalizedParent = applyContextPrefix(parentPath, detail);
  if (normalizedParent === detail.rootField) {
    return `the ${detail.subject}`;
  }

  return `the ${detail.subject} "${normalizedParent}"`;
}

function selectIndefiniteArticle(word: string): "a" | "an" {
  return /^[aeiou]/i.test(word) ? "an" : "a";
}

function describeError(
  error: ErrorObject,
  detail: ValidationContextDetail,
): { field: string; issue: string; suggestion?: string } {
  const instancePath = normalizeInstancePath(error.instancePath);

  if (error.keyword === "required") {
    const missingName = getParamString(error, "missingProperty");
    const baseField = appendPath(instancePath, missingName);
    const field = applyContextPrefix(baseField, detail);
    const issue = "is required but missing";
    const suggestion = missingName
      ? `Add the "${missingName}" property to ${describeLocation(instancePath, detail)}.`
      : `Add the required property to ${describeLocation(instancePath, detail)}.`;
    return { field, issue, suggestion };
  }

  if (error.keyword === "type") {
    const typeName = getParamString(error, "type");
    const field = applyContextPrefix(instancePath, detail);
    const issue = error.message ?? (typeName ? `must be ${typeName}` : "has an invalid type");
    const suggestion = typeName
      ? `Provide ${selectIndefiniteArticle(typeName)} ${typeName} for "${field}" in the ${detail.subject}.`
      : `Provide a value for "${field}" that matches the schema defined for the ${detail.subject}.`;
    return { field, issue, suggestion };
  }

  if (error.keyword === "additionalProperties") {
    const propertyName = getParamString(error, "additionalProperty");
    const baseField = appendPath(instancePath, propertyName);
    const field = applyContextPrefix(baseField, detail);
    const issue = propertyName
      ? `includes unsupported property "${propertyName}"`
      : error.message ?? "includes unsupported properties";
    const suggestion = propertyName
      ? `Remove the "${propertyName}" property from ${describeLocation(instancePath, detail)}.`
      : `Remove unsupported properties from ${describeLocation(instancePath, detail)}.`;
    return { field, issue, suggestion };
  }

  if (error.keyword === "enum") {
    const options = Array.isArray(error.schema) ? error.schema : undefined;
    const field = applyContextPrefix(instancePath, detail);
    const issue = error.message ?? "must match one of the allowed values";
    const suggestion = options?.length
      ? `Choose one of the allowed values (${options.join(", ")}) for "${field}" in the ${detail.subject}.`
      : `Choose an allowed value for "${field}" in the ${detail.subject}.`;
    return { field, issue, suggestion };
  }

  const field = applyContextPrefix(instancePath, detail);
  const issue = error.message ?? "is invalid";
  const suggestion = `Adjust "${field}" to satisfy the schema defined for the ${detail.subject}.`;
  return { field, issue, suggestion };
}

function formatErrors(
  validator: ValidateFunction | undefined,
  context: ValidationContext,
): string | undefined {
  if (!validator || !validator.errors || validator.errors.length === 0) {
    return undefined;
  }

  const detail = VALIDATION_CONTEXT_DETAILS[context];

  return validator.errors
    .map((error) => {
      const { field, issue, suggestion } = describeError(error, detail);
      const base = `Field ${field} ${issue}`;
      return suggestion ? `${base}. Suggestion: ${suggestion}` : base;
    })
    .join("; ");
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

    const {
      definition: normalizedDefinition,
      expectedSchemaId,
      dataValidator,
    } = this.prepareOutputSchema(definition);

    const compiled: ToolDefinition & {
      inputValidator: ValidateFunction;
      outputValidator: ValidateFunction;
      dataValidator?: ValidateFunction;
      expectedSchemaId?: string;
    } = {
      ...normalizedDefinition,
      inputValidator,
      outputValidator: this.toolResultValidator,
      dataValidator,
      expectedSchemaId,
    };
    this.tools.set(definition.name, compiled);
  }

  private prepareOutputSchema(
    definition: ToolDefinition,
  ): {
    definition: ToolDefinition;
    expectedSchemaId?: string;
    dataValidator?: ValidateFunction;
  } {
    if (!definition.outputSchema) {
      return { definition };
    }

    const outputSchema = {
      ...(definition.outputSchema as Record<string, unknown>),
    } as { $id?: unknown; id?: unknown } & Record<string, unknown>;

    const providedId =
      typeof outputSchema.$id === "string" && outputSchema.$id.trim().length > 0
        ? outputSchema.$id
        : typeof outputSchema.id === "string" && outputSchema.id.trim().length > 0
          ? outputSchema.id
          : undefined;

    const schemaId = providedId ?? `eddie.tool.${definition.name}.result.${randomUUID()}`;

    outputSchema.$id = schemaId;
    if (typeof outputSchema.id !== "string" || outputSchema.id.trim().length === 0) {
      outputSchema.id = schemaId;
    }

    let dataValidator = this.ajv.getSchema(schemaId) as ValidateFunction | undefined;
    if (!dataValidator) {
      const { id: _unusedId, ...schemaForValidation } = outputSchema as {
        id?: unknown;
        [key: string]: unknown;
      };
      void _unusedId;

      dataValidator = this.ajv.compile(schemaForValidation) as ValidateFunction;
    }

    return {
      definition: { ...definition, outputSchema },
      expectedSchemaId: schemaId,
      dataValidator,
    };
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
      const errors = formatErrors(tool.inputValidator, "arguments");
      throw new Error(`Validation failed for tool ${tool.name}: ${errors ?? "unknown error"}`);
    }

    const result = await tool.handler(parsedArgs, ctx);

    if (!tool.outputValidator(result)) {
      const errors = formatErrors(tool.outputValidator, "result");
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
        const errors = formatErrors(tool.dataValidator, "resultData");
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
