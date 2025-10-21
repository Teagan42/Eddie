import { Injectable } from "@nestjs/common";
import fs from "fs/promises";
import path from "path";
import nunjucks from "nunjucks";
import type { TemplateDescriptor, TemplateVariables } from "@eddie/types";
import { ConfigStore } from "@eddie/config";

const DEFAULT_ENCODING: BufferEncoding = "utf-8";
const INLINE_KEY = "<inline>";

interface EnvironmentEntry {
  key: string;
  env: nunjucks.Environment;
}

interface CachedTemplateEntry {
  template: nunjucks.Template;
  mtimeMs: number;
}

@Injectable()
export class TemplateRendererService {
  private readonly environments = new Map<string, nunjucks.Environment>();
  private readonly templateCache = new Map<string, CachedTemplateEntry>();

  constructor(private readonly configStore: ConfigStore) {
    if (!configStore) {
      throw new Error(
        "TemplateRendererService requires a ConfigStore instance"
      );
    }
  }

  async renderTemplate(
    descriptor: TemplateDescriptor,
    variables: TemplateVariables = {}
  ): Promise<string> {
    const defaultBaseDir = this.resolveDefaultBaseDir();
    const absolutePath = this.resolvePath(descriptor, defaultBaseDir);
    const encoding = descriptor.encoding ?? DEFAULT_ENCODING;
    const stats = await fs.stat(absolutePath);
    const mtimeMs = stats.mtimeMs;

    const mergedVariables: TemplateVariables = {
      ...(descriptor.variables ?? {}),
      ...variables,
    };

    const searchPaths = this.computeSearchPaths({
      baseDir: descriptor.baseDir,
      filename: absolutePath,
      defaultBaseDir,
    });
    const { env, key } = this.getEnvironment(searchPaths);
    const cacheKey = `${key}:${absolutePath}`;

    const cachedEntry = this.templateCache.get(cacheKey);
    let template: nunjucks.Template;

    if (this.isCacheEntryUsable(cachedEntry, mtimeMs)) {
      template = cachedEntry.template;
    } else {
      template = await this.refreshTemplateCache({
        absolutePath,
        cacheKey,
        encoding,
        env,
        mtimeMs,
      });
    }

    const rendered = template.render(mergedVariables);
    return rendered ?? "";
  }

  async renderString(
    template: string,
    variables: TemplateVariables = {},
    filename?: string
  ): Promise<string> {
    const searchPaths = this.computeSearchPaths({
      filename,
      defaultBaseDir: this.resolveDefaultBaseDir(),
    });
    const { env } = this.getEnvironment(searchPaths);
    const templateInstance = this.createTemplate(template, env, filename);
    const rendered = templateInstance.render(variables);
    return rendered ?? "";
  }

  private createTemplate(
    source: string,
    env: nunjucks.Environment,
    filename?: string
  ): nunjucks.Template {
    return new nunjucks.Template(source, env, filename, true);
  }

  private resolvePath(
    descriptor: TemplateDescriptor,
    defaultBaseDir: string
  ): string {
    const filePath = descriptor.file;

    if (path.isAbsolute(filePath) || path.win32.isAbsolute(filePath)) {
      return filePath;
    }

    const baseDir = descriptor.baseDir;
    const isAbsoluteBaseDir = Boolean(
      baseDir && (path.isAbsolute(baseDir) || path.win32.isAbsolute(baseDir))
    );

    const baseSegments = isAbsoluteBaseDir && baseDir
      ? [baseDir]
      : [defaultBaseDir, ...(baseDir ? [baseDir] : [])];

    return path.join(...baseSegments, filePath);
  }

  private computeSearchPaths(options: {
    baseDir?: string;
    filename?: string;
    defaultBaseDir: string;
  }): string[] {
    const paths = new Set<string>();
    if (options.baseDir) {
      paths.add(path.resolve(options.baseDir));
    }
    if (options.filename) {
      paths.add(path.resolve(path.dirname(options.filename)));
    }
    if (!paths.size) {
      paths.add(options.defaultBaseDir);
    }
    return Array.from(paths);
  }

  private getEnvironment(searchPaths: string[]): EnvironmentEntry {
    const key = searchPaths.length
      ? searchPaths.join("|")
      : INLINE_KEY;
    let env = this.environments.get(key);
    if (!env) {
      const loader = new nunjucks.FileSystemLoader(searchPaths, {
        noCache: false,
        watch: false,
      });
      env = new nunjucks.Environment(loader, {
        autoescape: false,
      });
      this.environments.set(key, env);
    }

    return { key, env };
  }

  private async refreshTemplateCache(options: {
    absolutePath: string;
    cacheKey: string;
    encoding: BufferEncoding;
    env: nunjucks.Environment;
    mtimeMs: number;
  }): Promise<nunjucks.Template> {
    const { absolutePath, cacheKey, encoding, env, mtimeMs } = options;
    const source = await fs.readFile(absolutePath, { encoding });
    const template = this.createTemplate(source, env, absolutePath);
    this.templateCache.set(cacheKey, { template, mtimeMs });
    return template;
  }

  private isCacheEntryUsable(
    entry: CachedTemplateEntry | undefined,
    mtimeMs: number
  ): entry is CachedTemplateEntry {
    return Boolean(entry && entry.template && entry.mtimeMs === mtimeMs);
  }

  private async getOrCreateTemplate(options: {
    absolutePath: string;
    cacheKey: string;
    cachedEntry: CachedTemplateEntry | undefined;
    encoding: BufferEncoding;
    env: nunjucks.Environment;
    mtimeMs: number;
  }): Promise<nunjucks.Template> {
    const { absolutePath, cacheKey, cachedEntry, encoding, env, mtimeMs } =
      options;

    if (this.isCacheEntryUsable(cachedEntry, mtimeMs)) {
      return cachedEntry.template;
    }

    const source = await fs.readFile(absolutePath, { encoding });
    const template = this.createTemplate(source, env, absolutePath);
    this.templateCache.set(cacheKey, { template, mtimeMs });
    return template;
  }

  private resolveDefaultBaseDir(): string {
    const projectDir = this.configStore.getSnapshot()?.projectDir;
    if (typeof projectDir === "string" && projectDir.trim() !== "") {
      return path.resolve(projectDir);
    }

    return process.cwd();
  }
}
