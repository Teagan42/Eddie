import { Injectable } from "@nestjs/common";
import fs from "fs/promises";
import path from "path";

@Injectable()
export class JsonlWriterService {
  async write(filePath: string, event: unknown, append = true): Promise<void> {
    await this.ensureDirectory(filePath);
    const payload = `${JSON.stringify(event)}\n`;
    if (append) {
      await fs.appendFile(filePath, payload, "utf-8");
    } else {
      await fs.writeFile(filePath, payload, "utf-8");
    }
  }

  private async ensureDirectory(filePath: string): Promise<void> {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
  }
}

