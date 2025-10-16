import { Module } from "@nestjs/common";
import { TemplateRendererService } from "./template-renderer.service";
import {
  TemplateRuntimeService,
  templateRuntimeProviders,
} from "./template-runtime.service";

const templateModuleProviders = [
  TemplateRendererService,
  ...templateRuntimeProviders,
];

const templateModuleExports = [
  TemplateRendererService,
  TemplateRuntimeService,
];

@Module({
  providers: templateModuleProviders,
  exports: templateModuleExports,
})
export class TemplateModule {}
