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
} from "@eddie/config";
import type { PackedContext, PackedFile, PackedResource } from "@eddie/types";
import { LoggerService } from "@eddie/io";
import { TemplateRendererService } from "@eddie/templates";
import type { TemplateVariables } from "@eddie/templates";
import { formatResourceText } from "./utils/resource-text";

const DEFAULT_MAX_BYTES = 250_000;
const DEFAULT_MAX_FILES = 64;
const DEFAULT_TEXT_EXTENSIONS = [
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "cts",
  "mts",
  "json",
  "jsonc",
  "json5",
  "md",
  "mdx",
  "txt",
  "csv",
  "tsv",
  "yml",
  "yaml",
  "toml",
  "ini",
  "xml",
  "html",
  "htm",
  "css",
  "scss",
  "less",
  "sass",
  "styl",
  "py",
  "rb",
  "rs",
  "go",
  "java",
  "kt",
  "kts",
  "scala",
  "php",
  "cs",
  "cpp",
  "cxx",
  "cc",
  "c",
  "h",
  "hpp",
  "hxx",
  "hh",
  "swift",
  "sql",
  "graphql",
  "gql",
  "proto",
  "prisma",
  "vue",
  "svelte",
  "astro",
  "sh",
  "bash",
  "zsh",
  "fish",
  "ps1",
  "psm1",
  "psd1",
  "bat",
  "cmd",
  "gradle",
  "properties",
  "env",
  "dotenv",
  "config",
  "conf",
  "lock",
];
const DEFAULT_INCLUDE_PATTERNS = [
  `**/*.{${DEFAULT_TEXT_EXTENSIONS.join(",")}}`,
  "**/Dockerfile",
  "**/Makefile",
  "**/docker-compose*.{yml,yaml}",
  "**/.env",
  "**/.env.*",
  "**/.gitignore",
  "**/.npmrc",
  "**/.yarnrc",
  "**/.prettierrc",
  "**/.prettierrc.*",
  "**/.eslintrc",
  "**/.eslintrc.*",
  "**/.editorconfig",
  "**/.babelrc",
  "**/.babelrc.*",
  "**/tsconfig*.json",
  "**/vitest.config.*",
  "**/jest.config.*",
  "**/package.json",
  "**/package-lock.json",
  "**/pnpm-lock.yaml",
  "**/yarn.lock",
  "**/bun.lockb",
  "**/Cargo.toml",
  "**/Cargo.lock",
  "**/go.mod",
  "**/go.sum",
  "**/composer.json",
  "**/composer.lock",
  "**/requirements*.txt",
  "**/pyproject.toml",
  "**/Pipfile",
  "**/Pipfile.lock",
  "**/Gemfile",
  "**/Gemfile.lock",
  "**/.tool-versions",
];

const DEFAULT_EXCLUDE_PATTERNS = [
  "**/node_modules/**",
  "**/.git/**",
  "**/.hg/**",
  "**/.svn/**",
  "**/.cache/**",
  "**/.turbo/**",
  "**/.next/**",
  "**/.nuxt/**",
  "**/.vercel/**",
  "**/.expo/**",
  "**/.yalc/**",
  "**/.yarn/**",
  "**/.pnpm-store/**",
  "**/dist/**",
  "**/build/**",
  "**/.output/**",
  "**/coverage/**",
  "**/tmp/**",
  "**/temp/**",
  "**/logs/**",
  "**/artifacts/**",
];

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
    const includePatterns = config.include?.length
      ? config.include
      : DEFAULT_INCLUDE_PATTERNS;
    const excludePatterns = config.exclude?.length
      ? [...DEFAULT_EXCLUDE_PATTERNS, ...config.exclude]
      : DEFAULT_EXCLUDE_PATTERNS;
    const maxBytes = config.maxBytes ?? DEFAULT_MAX_BYTES;
    const maxFiles = config.maxFiles ?? DEFAULT_MAX_FILES;
    const baseVariables = config.variables ?? {};
    const resourceConfigs = config.resources ?? [];

    const globResults = await fg(
      includePatterns,
      this.createGlobOptions(baseDir, excludePatterns)
    );

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
        const stat = await fs.stat(absolutePath);
        if (
          this.isOverBudget({
            logger,
            metadata: { file: relPath, maxBytes },
            message: "Skipping file beyond budget",
            current: totalBytes,
            addition: stat.size,
            max: maxBytes,
          })
        ) {
          continue;
        }

        const content = await fs.readFile(absolutePath, "utf-8");
        const bytes = Buffer.byteLength(content);
        if (
          this.isOverBudget({
            logger,
            metadata: { file: relPath, maxBytes },
            message: "Skipping file beyond budget",
            current: totalBytes,
            addition: bytes,
            max: maxBytes,
          })
        ) {
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

      const section = formatResourceText(result.resource);
      textSections.push(section);
    }

    const text = textSections.filter((section) => section.trim().length > 0).join("\n\n");

    return {
      files,
      totalBytes,
      text,
      resources,
    };
  }

  private isOverBudget(options: {
    logger: ReturnType<LoggerService["getLogger"]>;
    metadata: Record<string, unknown>;
    message: string;
    current: number;
    addition: number;
    max: number;
  }): boolean {
    if (options.current + options.addition > options.max) {
      options.logger.debug(options.metadata, options.message);
      return true;
    }

    return false;
  }

  private composeFileText(files: PackedFile[]): string {
    return files
      .map((file) =>
        `// File: ${file.path}\n${file.content.trimEnd()}\n// End of ${file.path}`
      )
      .join("\n\n");
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
      : DEFAULT_INCLUDE_PATTERNS;
    const excludePatterns = resource.exclude?.length
      ? [...DEFAULT_EXCLUDE_PATTERNS, ...resource.exclude]
      : DEFAULT_EXCLUDE_PATTERNS;
    const globResults = await fg(
      includePatterns,
      this.createGlobOptions(baseDir, excludePatterns)
    );

    const ig = ignore().add(excludePatterns);
    const files: PackedFile[] = [];
    let bytes = 0;

    for (const relPath of globResults) {
      if (ig.ignores(relPath)) {
        continue;
      }

      const absolutePath = path.resolve(baseDir, relPath);
      try {
        const stat = await fs.stat(absolutePath);
        if (
          this.isOverBudget({
            logger: options.logger,
            metadata: {
              resource: resource.id,
              file: relPath,
              maxBytes: options.maxBytes,
            },
            message: "Skipping resource file beyond budget",
            current: options.totalBytes + bytes,
            addition: stat.size,
            max: options.maxBytes,
          })
        ) {
          continue;
        }

        const content = await fs.readFile(absolutePath, "utf-8");
        const fileBytes = Buffer.byteLength(content);
        if (
          this.isOverBudget({
            logger: options.logger,
            metadata: {
              resource: resource.id,
              file: relPath,
              maxBytes: options.maxBytes,
            },
            message: "Skipping resource file beyond budget",
            current: options.totalBytes + bytes,
            addition: fileBytes,
            max: options.maxBytes,
          })
        ) {
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

    if (
      this.isOverBudget({
        logger: options.logger,
        metadata: { resource: resource.id, maxBytes: options.maxBytes },
        message: "Skipping resource template beyond budget",
        current: options.totalBytes,
        addition: bytes,
        max: options.maxBytes,
      })
    ) {
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

  private createGlobOptions(baseDir: string, excludePatterns: string[]) {
    return {
      cwd: baseDir,
      dot: true,
      onlyFiles: true,
      ignore: excludePatterns,
    } as const;
  }
}
