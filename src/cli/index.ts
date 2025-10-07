#!/usr/bin/env node
import { Command } from "commander";
import { ask } from "./commands/ask";
import { context } from "./commands/context";
import { run } from "./commands/run";
import { trace } from "./commands/trace";
import { chat } from "./commands/chat";

type Opts = Record<string, unknown>;

function withSharedOptions(command: Command) {
  return command
    .option("-C, --context <glob...>", "Include context globs")
    .option("-c, --config <path>", "Path to configuration file")
    .option("-m, --model <name>", "Override model")
    .option("-p, --provider <name>", "Override provider")
    .option("-t, --tools <names>", "Comma separated tool allowlist")
    .option("--jsonl-trace <path>", "Override JSONL trace path")
    .option("--auto-approve", "Automatically approve tool execution", false)
    .option("--non-interactive", "Disable interactive confirmations", false);
}

const program = new Command();

program.name("eddie").description("Provider-agnostic LLM CLI assistant");

withSharedOptions(program.command("ask").argument("<prompt>", "Prompt text")).action(
  async (prompt: string, options: Opts) => {
    await ask(prompt, {
      ...options,
      autoApprove: options.autoApprove,
    });
  }
);

withSharedOptions(program.command("run").argument("<prompt>", "Prompt text")).action(
  async (prompt: string, options: Opts) => {
    await run(prompt, options);
  }
);

withSharedOptions(
  program.command("context").description("Preview context files")
).action(async (options: Opts) => {
  await context(options);
});

withSharedOptions(
  program.command("chat").description("Start interactive chat session")
).action(async (options: Opts) => {
  await chat(options);
});

withSharedOptions(
  program.command("trace").description("Inspect JSONL trace")
).action(async (options: Opts) => {
  await trace(options);
});

void program.parseAsync(process.argv).catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
