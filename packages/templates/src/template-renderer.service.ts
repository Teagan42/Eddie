import { Injectable } from "@nestjs/common";
import fs from "fs/promises";
import path from "path";
import { Eta } from "eta";
import type { TemplateDescriptor, TemplateVariables } from "./template.types";

const DEFAULT_ENCODING: BufferEncoding = "utf-8";

@Injectable()
export class TemplateRendererService {
  private readonly engine = new Eta({
    cache: true,
    autoEscape: false,
    useWith: true,
  });

  async renderTemplate(
    descriptor: TemplateDescriptor,
    variables: TemplateVariables = {}
  ): Promise<string> {
    const absolutePath = this.resolvePath(descriptor);
    const source = await fs.readFile(absolutePath, {
      encoding: descriptor.encoding ?? DEFAULT_ENCODING,
    });
    const mergedVariables = this.prepareVariables({
      ...(descriptor.variables ?? {}),
      ...variables,
    });

    return this.renderStringInternal(
      source,
      mergedVariables,
      absolutePath,
      descriptor.baseDir
    );
  }

  async renderString(
    template: string,
    variables: TemplateVariables = {},
    filename?: string
  ): Promise<string> {
    const prepared = this.prepareVariables(variables);
    return this.renderStringInternal(template, prepared, filename);
  }

  private resolvePath(descriptor: TemplateDescriptor): string {
    const baseDir = descriptor.baseDir ?? process.cwd();
    return path.isAbsolute(descriptor.file)
      ? descriptor.file
      : path.resolve(baseDir, descriptor.file);
  }

  private prepareVariables(
    variables: TemplateVariables = {}
  ): TemplateVariables {
    const clone: TemplateVariables & {
      [Symbol.unscopables]?: Record<string, boolean>;
    } = { ...variables };

    if (Object.prototype.hasOwnProperty.call(clone, "layout")) {
      const existing = clone[Symbol.unscopables] ?? {};
      clone[Symbol.unscopables] = { ...existing, layout: true };
    }

    return clone;
  }

  private async renderStringInternal(
    template: string,
    variables: TemplateVariables,
    filename?: string,
    baseDir?: string
  ): Promise<string> {
    const viewsRoot = baseDir
      ? path.resolve(baseDir)
      : filename
        ? path.dirname(filename)
        : process.cwd();

    const previousViews = this.engine.config.views;
    this.engine.config.views = viewsRoot;

    try {
      if (filename) {
        const cacheKey = `@${filename}`;
        const cached = this.engine.templatesAsync.get(cacheKey);
        if (!cached) {
          const compiled = this.engine.compile(template, {
            async: true,
            filepath: filename,
          });
          this.engine.templatesAsync.define(cacheKey, compiled);
        }

        const rendered = await this.engine.renderAsync(cacheKey, variables, {
          filepath: filename,
        });
        return rendered ?? "";
      }

      const rendered = await this.engine.renderStringAsync(template, variables);
      return rendered ?? "";
    } finally {
      this.engine.config.views = previousViews;
    }
  }
}
