import { Injectable } from "@nestjs/common";
import fs from "fs/promises";
import path from "path";

export interface JsonlWriterEvent {
  filePath: string;
  event: unknown;
  append: boolean;
}

export type JsonlWriterListener = (event: JsonlWriterEvent) => void;

@Injectable()
export class JsonlWriterService {
  private readonly listeners = new Set<JsonlWriterListener>();

  registerListener(listener: JsonlWriterListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async write(filePath: string, event: unknown, append = true): Promise<void> {
    await this.ensureDirectory(filePath);
    const payload = `${JSON.stringify(event)}\n`;
    if (append) {
      await fs.appendFile(filePath, payload, "utf-8");
    } else {
      await fs.writeFile(filePath, payload, "utf-8");
    }

    this.notify({ filePath, event, append });
  }

  private async ensureDirectory(filePath: string): Promise<void> {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
  }

  private notify(event: JsonlWriterEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

