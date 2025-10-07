import { Injectable } from "@nestjs/common";
import fs from "fs/promises";
import path from "path";
import { Eta } from "eta";
import type { BufferEncoding } from "node:buffer";
import type {
  TemplateDescriptor,
  TemplateVariables,
} from "../../shared/template.types";

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
    const source = await fs.readFile(
      absolutePath,
      descriptor.encoding ?? DEFAULT_ENCODING
    );
    return this.renderString(source, {
      ...(descriptor.variables ?? {}),
      ...variables,
    }, absolutePath);
  }

  async renderString(
    template: string,
    variables: TemplateVariables = {},
    filename?: string
  ): Promise<string> {
    const rendered = await this.engine.renderStringAsync(template, variables, {
      filename,
    });
    return rendered ?? "";
  }

  private resolvePath(descriptor: TemplateDescriptor): string {
    const baseDir = descriptor.baseDir ?? process.cwd();
    return path.isAbsolute(descriptor.file)
      ? descriptor.file
      : path.resolve(baseDir, descriptor.file);
  }
}
