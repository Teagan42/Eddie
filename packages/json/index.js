import { JsonReporter } from 'vitest/reporters';

export default class WorkspaceJsonReporter extends JsonReporter {
  constructor(options = {}) {
    const outputFile = process.env.BENCHMARK_OUTPUT_PATH ?? options.outputFile;
    super({ ...options, outputFile });
  }
}
