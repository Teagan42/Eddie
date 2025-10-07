import { Injectable } from "@nestjs/common";
import fs from "fs/promises";
import path from "path";
import fg from "fast-glob";
import ignore from "ignore";
import type { ContextConfig } from "../../config/types";
import type { PackedContext } from "../types";
import { LoggerService } from "../../io/logger";

const DEFAULT_MAX_BYTES = 250_000;
const DEFAULT_MAX_FILES = 64;

@Injectable()
export class ContextService {
  constructor(private readonly loggerService: LoggerService) {}

  async pack(config: ContextConfig): Promise<PackedContext> {
    const logger = this.loggerService.getLogger("context:packer");
    const baseDir = config.baseDir ?? process.cwd();
    const includePatterns = config.include?.length ? config.include : ["**/*"];
    const excludePatterns = config.exclude ?? [];
    const maxBytes = config.maxBytes ?? DEFAULT_MAX_BYTES;
    const maxFiles = config.maxFiles ?? DEFAULT_MAX_FILES;

    const globResults = await fg(includePatterns, {
      cwd: baseDir,
      dot: true,
      onlyFiles: true,
    });

    const ig = ignore().add(excludePatterns);

    const files: PackedContext["files"] = [];
    let totalBytes = 0;

    for (const relPath of globResults) {
      if (files.length >= maxFiles) {
        logger.debug(`Context file limit reached (${maxFiles}).`);
        break;
      }

      if (ig.ignores(relPath)) {
        continue;
      }

      const absolutePath = path.resolve(baseDir, relPath);
      try {
        const content = await fs.readFile(absolutePath, "utf-8");
        const bytes = Buffer.byteLength(content);
        if (totalBytes + bytes > maxBytes) {
          logger.debug({ file: relPath, maxBytes }, "Skipping file beyond budget");
          continue;
        }

        files.push({
          path: relPath,
          bytes,
          content,
        });
        totalBytes += bytes;
      } catch (error) {
        logger.warn(
          { err: error instanceof Error ? error.message : error, file: relPath },
          "Failed to read context file"
        );
      }
    }

    const text = files
      .map(
        (file) =>
          `// File: ${file.path}\n${file.content.trimEnd()}\n// End of ${file.path}`
      )
      .join("\n\n");

    return {
      files,
      totalBytes,
      text,
    };
  }
}
