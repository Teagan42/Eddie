import { Injectable } from "@nestjs/common";
import fs from "fs/promises";
import path from "path";
import fg from "fast-glob";
import ignore from "ignore";
import type {
  ContextConfig,
  ContextResourceBundleConfig,
  ContextResourceConfig,
  ContextResourceTemplateConfig,
} from "../../config/types";
import type { PackedContext, PackedFile, PackedResource } from "../types";
import { LoggerService } from "../../io/logger.service";
import { TemplateRendererService } from "../templates/template-renderer.service";
import type { TemplateVariables } from "../../shared/template.types";

const DEFAULT_MAX_BYTES = 250_000;
const DEFAULT_MAX_FILES = 64;

interface ResourceLoadResult {
  resource: PackedResource;
  bytes: number;
}

@Injectable()
export class ContextService {
  constructor(
    private readonly loggerService: LoggerService,
    private readonly templateRenderer: TemplateRendererService
  ) {}

  async pack(config: ContextConfig): Promise<PackedContext> {
    const logger = this.loggerService.getLogger("context:service");
    const baseDir = config.baseDir ?? process.cwd();
    const includePatterns = config.include?.length ? config.include : ["**/*"];
    const excludePatterns = config.exclude ?? [];
    const maxBytes = config.maxBytes ?? DEFAULT_MAX_BYTES;
    const maxFiles = config.maxFiles ?? DEFAULT_MAX_FILES;
    const baseVariables = config.variables ?? {};
    const resourceConfigs = config.resources ?? [];

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

    const textSections: string[] = [];
    if (files.length > 0) {
      textSections.push(this.composeFileText(files));
    }

    const resources: PackedResource[] = [];

    for (const resourceConfig of resourceConfigs) {
      const result = await this.loadResource(
        resourceConfig,
        {
          baseDir,
          maxBytes,
          totalBytes,
          variables: baseVariables,
          logger,
        }
      );

      if (!result) {
        continue;
      }

      totalBytes += result.bytes;
      resources.push(result.resource);

      const section = this.composeResourceText(result.resource);
      if (section) {
        textSections.push(section);
      }
    }

    const text = textSections.filter((section) => section.trim().length > 0).join("\n\n");

    return {
      files,
      totalBytes,
      text,
      resources,
    };
  }

  private composeFileText(files: PackedFile[]): string {
    return files
      .map((file) =>
        `// File: ${file.path}\n${file.content.trimEnd()}\n// End of ${file.path}`
      )
      .join("\n\n");
  }

  private composeResourceText(resource: PackedResource): string {
    const label = resource.name ?? resource.id;
    const description = resource.description ? ` - ${resource.description}` : "";
    const body = resource.text.trimEnd();
    const lines = [`// Resource: ${label}${description}`];

    if (body.length > 0) {
      lines.push(body);
    }

    lines.push(`// End Resource: ${label}`);
    return lines.join("\n");
  }

  private async loadResource(
    resource: ContextResourceConfig,
    options: {
      baseDir: string;
      maxBytes: number;
      totalBytes: number;
      variables: TemplateVariables;
      logger: ReturnType<LoggerService["getLogger"]>;
    }
  ): Promise<ResourceLoadResult | null> {
    if (resource.type === "bundle") {
      return this.loadBundleResource(resource, options);
    }
    return this.loadTemplateResource(resource, options);
  }

  private async loadBundleResource(
    resource: ContextResourceBundleConfig,
    options: {
      baseDir: string;
      maxBytes: number;
      totalBytes: number;
      logger: ReturnType<LoggerService["getLogger"]>;
    }
  ): Promise<ResourceLoadResult | null> {
    const baseDir = resource.baseDir ?? options.baseDir;
    const includePatterns = resource.include.length
      ? resource.include
      : ["**/*"];
    const excludePatterns = resource.exclude ?? [];
    const globResults = await fg(includePatterns, {
      cwd: baseDir,
      dot: true,
      onlyFiles: true,
    });

    const ig = ignore().add(excludePatterns);
    const files: PackedFile[] = [];
    let bytes = 0;

    for (const relPath of globResults) {
      if (ig.ignores(relPath)) {
        continue;
      }

      const absolutePath = path.resolve(baseDir, relPath);
      try {
        const content = await fs.readFile(absolutePath, "utf-8");
        const fileBytes = Buffer.byteLength(content);
        if (options.totalBytes + bytes + fileBytes > options.maxBytes) {
          options.logger.debug(
            { resource: resource.id, file: relPath, maxBytes: options.maxBytes },
            "Skipping resource file beyond budget"
          );
          continue;
        }

        const normalizedRel = relPath.split(path.sep).join("/");
        const storedPath = resource.virtualPath
          ? `${resource.virtualPath.replace(/\\/g, "/").replace(/\/$/, "")}/${normalizedRel}`
          : normalizedRel;

        files.push({
          path: storedPath,
          bytes: fileBytes,
          content,
        });
        bytes += fileBytes;
      } catch (error) {
        options.logger.warn(
          {
            err: error instanceof Error ? error.message : error,
            file: relPath,
            resource: resource.id,
          },
          "Failed to read resource file"
        );
      }
    }

    if (files.length === 0) {
      return null;
    }

    const text = this.composeFileText(files);
    const metadata: Record<string, unknown> = {};
    if (resource.virtualPath) {
      metadata.virtualPath = resource.virtualPath;
    }

    const packed: PackedResource = {
      id: resource.id,
      type: "bundle",
      name: resource.name,
      description: resource.description,
      text,
      files,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    };

    return {
      resource: packed,
      bytes,
    };
  }

  private async loadTemplateResource(
    resource: ContextResourceTemplateConfig,
    options: {
      maxBytes: number;
      totalBytes: number;
      variables: TemplateVariables;
      logger: ReturnType<LoggerService["getLogger"]>;
    }
  ): Promise<ResourceLoadResult | null> {
    const rendered = await this.templateRenderer.renderTemplate(
      resource.template,
      {
        ...options.variables,
        ...(resource.variables ?? {}),
      }
    );

    const text = rendered.trimEnd();
    const bytes = Buffer.byteLength(text);

    if (options.totalBytes + bytes > options.maxBytes) {
      options.logger.debug(
        { resource: resource.id, maxBytes: options.maxBytes },
        "Skipping resource template beyond budget"
      );
      return null;
    }

    const packed: PackedResource = {
      id: resource.id,
      type: "template",
      name: resource.name,
      description: resource.description,
      text,
    };

    return {
      resource: packed,
      bytes,
    };
  }
}
