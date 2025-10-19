import { readFile } from "node:fs/promises";

import { ZodError, type ZodType } from "zod";

import {
  demoLogsFixtureSchema,
  demoSessionsFixtureSchema,
  demoTracesFixtureSchema,
  type DemoLogsFixtureFile,
  type DemoSessionsFixtureFile,
  type DemoTracesFixtureFile,
} from "./demo-data.schema";

/**
 * Error thrown when a demo fixture fails schema validation.
 */
export class DemoFixtureValidationError extends Error {
  readonly fixtureType: string;
  readonly filePath: string;
  readonly issues: ZodError["issues"];
  readonly issueCount: number;

  constructor(fixtureType: string, filePath: string, cause: ZodError) {
    super(
      `Invalid ${fixtureType} fixture at ${filePath}: ${formatIssues(cause)}`,
      { cause }
    );
    this.name = "DemoFixtureValidationError";
    this.fixtureType = fixtureType;
    this.filePath = filePath;
    this.issues = cause.issues;
    this.issueCount = cause.issues.length;
  }
}

function formatPath(path: PropertyKey[]): string {
  if (path.length === 0) {
    return "value";
  }

  return path.reduce<string>((acc, segment, index) => {
    if (typeof segment === "number") {
      return `${acc}[${segment}]`;
    }

    const label = typeof segment === "string" ? segment : segment.toString();

    if (index === 0 && acc.length === 0) {
      return label;
    }

    return `${acc}.${label}`;
  }, "");
}

function formatIssues(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const path = formatPath(issue.path);
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

async function readFixtureFile(filePath: string): Promise<unknown> {
  const raw = await readFile(filePath, "utf-8");
  return JSON.parse(raw) as unknown;
}

async function validateFixture<T>(
  filePath: string,
  schema: ZodType<T>,
  fixtureType: string
): Promise<T> {
  const data = await readFixtureFile(filePath);
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new DemoFixtureValidationError(fixtureType, filePath, error);
    }
    throw error;
  }
}

export async function loadDemoSessionsFixture(
  filePath: string
): Promise<DemoSessionsFixtureFile> {
  return validateFixture(filePath, demoSessionsFixtureSchema, "demo sessions");
}

export async function loadDemoTracesFixture(
  filePath: string
): Promise<DemoTracesFixtureFile> {
  return validateFixture(filePath, demoTracesFixtureSchema, "demo traces");
}

export async function loadDemoLogsFixture(
  filePath: string
): Promise<DemoLogsFixtureFile> {
  return validateFixture(filePath, demoLogsFixtureSchema, "demo logs");
}
