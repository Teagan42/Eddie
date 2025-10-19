import { promises as fs } from "fs";

import {
  DemoDataValidationError,
  validateDemoData,
  type DemoData,
} from "./demo-data.schema";

export async function loadDemoData(path: string): Promise<DemoData> {
  let serialized: string;
  try {
    serialized = await fs.readFile(path, "utf8");
  } catch (error) {
    throw new Error(`Failed to read demo data file at ${path}: ${String(error)}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch (error) {
    throw new Error(`Failed to parse demo data file at ${path}: ${String(error)}`);
  }

  try {
    return validateDemoData(parsed);
  } catch (error) {
    if (error instanceof DemoDataValidationError) {
      throw error;
    }
    throw new Error(`Demo data validation failed: ${String(error)}`);
  }
}
