import { Injectable } from "@nestjs/common";
import fs from "fs/promises";
import path from "path";
import nunjucks from "nunjucks";
import type { TemplateDescriptor, TemplateVariables } from "./template.types";

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

  async renderTemplate(
    descriptor: TemplateDescriptor,
    variables: TemplateVariables = {}
  ): Promise<string> {
    const absolutePath = this.resolvePath(descriptor);
    const encoding = descriptor.encoding ?? DEFAULT_ENCODING;
    const [source, stats] = await Promise.all([
      fs.readFile(absolutePath, { encoding }),
      fs.stat(absolutePath),
    ]);
    const mtimeMs = stats.mtimeMs;

    const mergedVariables: TemplateVariables = {
      ...(descriptor.variables ?? {}),
      ...variables,
    };

    const searchPaths = this.computeSearchPaths({
      baseDir: descriptor.baseDir,
      filename: absolutePath,
    });
    const { env, key } = this.getEnvironment(searchPaths);
    const cacheKey = `${key}:${absolutePath}`;

    const cachedEntry = this.templateCache.get(cacheKey);
    let template: nunjucks.Template | undefined = cachedEntry?.template;
    const needsRebuild =
      !template || this.isCacheEntryStale(cachedEntry, mtimeMs);

    if (needsRebuild) {
      template = this.createTemplate(source, env, absolutePath);
      this.templateCache.set(cacheKey, { template, mtimeMs });
    }

    const rendered = template.render(mergedVariables);
    return rendered ?? "";
  }

  async renderString(
    template: string,
    variables: TemplateVariables = {},
    filename?: string
  ): Promise<string> {
    const searchPaths = this.computeSearchPaths({ filename });
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

  private resolvePath(descriptor: TemplateDescriptor): string {
    const baseDir = descriptor.baseDir ?? process.cwd();
    return path.isAbsolute(descriptor.file)
      ? descriptor.file
      : path.resolve(baseDir, descriptor.file);
  }

  private computeSearchPaths(options: {
    baseDir?: string;
    filename?: string;
  }): string[] {
    const paths = new Set<string>();
    if (options.baseDir) {
      paths.add(path.resolve(options.baseDir));
    }
    if (options.filename) {
      paths.add(path.resolve(path.dirname(options.filename)));
    }
    if (!paths.size) {
      paths.add(process.cwd());
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

  private isCacheEntryStale(
    entry: CachedTemplateEntry | undefined,
    mtimeMs: number
  ): boolean {
    return !entry || entry.mtimeMs !== mtimeMs;
  }
}
