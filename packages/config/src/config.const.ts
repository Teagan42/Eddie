import { ConfigurableModuleBuilder } from '@nestjs/common';
import { CliRuntimeOptions } from './types';

export const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN } =
  new ConfigurableModuleBuilder<CliRuntimeOptions>().build();
