export interface CliArguments {
  /**
   * The name of the command to execute (e.g. `ask`, `run`).
   */
  readonly command: string;
  /**
   * Positional arguments that follow the command name.
   */
  readonly positionals: string[];
  /**
   * Raw option map keyed by camelCase flag names (e.g. `autoApprove`).
   */
  readonly options: Record<string, unknown>;
}

