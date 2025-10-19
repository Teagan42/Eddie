import { Injectable } from "@nestjs/common";
import { promises as fs } from "fs";
import path from "path";
import type { ChatMessage, EddieConfig } from "@eddie/types";
import type { Logger } from "pino";

type SeedChatMessage = {
  id?: string;
  role: string;
  content: string;
  name?: string;
};

type ChatSessionsSeed = {
  sessions?: Array<{
    id?: string;
    title?: string;
    messages?: SeedChatMessage[];
  }>;
};

type TraceSeed = {
  events?: unknown[];
};

type LogSeed = {
  entries?: Array<{
    timestamp?: string;
    level?: string;
    message: string;
    context?: Record<string, unknown>;
  }>;
};

type RuntimeConfigSeed = {
  runtime?: Record<string, unknown>;
};

interface ReplayIfEnabledOptions {
  config: EddieConfig;
  prompt: string;
  projectDir: string;
  tracePath?: string;
  logger: Logger;
}

interface ReplayResult {
  messages: ChatMessage[];
  assistantMessages: number;
  tracePath?: string;
}

@Injectable()
export class DemoSeedReplayService {
  async replayIfEnabled(options: ReplayIfEnabledOptions): Promise<ReplayResult | undefined> {
    const { config } = options;
    if (!config.demoSeeds) {
      return undefined;
    }

    return this.replay(options);
  }

  private async replay(options: ReplayIfEnabledOptions): Promise<ReplayResult> {
    const { config, projectDir, logger, prompt } = options;
    const seeds = config.demoSeeds ?? {};

    const [ chatSessions, logs, traces, runtimeConfig ] = await Promise.all([
      this.readSeedFile<ChatSessionsSeed>(projectDir, seeds.chatSessions),
      this.readSeedFile<LogSeed>(projectDir, seeds.logs),
      this.readSeedFile<TraceSeed>(projectDir, seeds.traces),
      this.readSeedFile<RuntimeConfigSeed>(projectDir, seeds.runtimeConfig),
    ]);

    this.replayLogs(logger, logs);
    this.describeRuntimeConfig(logger, runtimeConfig);

    const tracePath = await this.writeTrace(options.tracePath, projectDir, traces);
    const { messages, assistantMessages } = this.composeMessages({
      config,
      prompt,
      chatSessions,
    });

    return { messages, tracePath, assistantMessages };
  }

  private async readSeedFile<T>(
    projectDir: string,
    seedPath: string | undefined
  ): Promise<T | undefined> {
    if (!seedPath) {
      return undefined;
    }

    const resolved = path.isAbsolute(seedPath)
      ? seedPath
      : path.resolve(projectDir, seedPath);

    const contents = await fs.readFile(resolved, "utf-8");
    return JSON.parse(contents) as T;
  }

  private composeMessages({
    config,
    prompt,
    chatSessions,
  }: {
    config: EddieConfig;
    prompt: string;
    chatSessions?: ChatSessionsSeed;
  }): { messages: ChatMessage[]; assistantMessages: number } {
    const systemMessage: ChatMessage = {
      role: "system",
      content: config.systemPrompt,
    };

    const fallback: ChatMessage[] = [
      systemMessage,
      { role: "user", content: prompt },
      {
        role: "assistant",
        content:
          "Replaying demo preset without contacting a model provider. Refer to the documentation dataset for full context.",
      },
    ];

    const session = chatSessions?.sessions?.[0];
    if (!session || !session.messages || session.messages.length === 0) {
      return { messages: fallback, assistantMessages: 1 };
    }

    const normalized: ChatMessage[] = [systemMessage];
    let assistantMessages = 0;

    for (const message of session.messages) {
      const role = this.toChatRole(message.role);
      const entry: ChatMessage = {
        role,
        content: message.content,
      };

      if (message.name) {
        entry.name = message.name;
      }

      if (role === "assistant") {
        assistantMessages += 1;
      }

      normalized.push(entry);
    }

    if (assistantMessages === 0) {
      normalized.push({
        role: "assistant",
        content:
          "Replaying demo preset without contacting a model provider. Refer to the documentation dataset for full context.",
      });
      assistantMessages = 1;
    }

    return { messages: normalized, assistantMessages };
  }

  private toChatRole(role: string | undefined): ChatMessage["role"] {
    if (role === "assistant" || role === "system" || role === "tool") {
      return role;
    }

    return "user";
  }

  private replayLogs(logger: Logger, logs?: LogSeed): void {
    const entries = logs?.entries;
    if (!entries || entries.length === 0) {
      return;
    }

    for (const entry of entries) {
      const level = this.normalizeLevel(entry.level);
      const context = entry.context ? { ...entry.context } : undefined;
      const message = entry.message ?? "";

      this.logWithLevel(logger, level, context, message);
    }
  }

  private describeRuntimeConfig(logger: Logger, runtime?: RuntimeConfigSeed): void {
    if (!runtime?.runtime) {
      return;
    }

    logger.info({ demoRuntime: runtime.runtime }, "Loaded demo runtime metadata");
  }

  private async writeTrace(
    configuredTracePath: string | undefined,
    projectDir: string,
    traces?: TraceSeed
  ): Promise<string | undefined> {
    if (!configuredTracePath) {
      return undefined;
    }

    if (!traces?.events || traces.events.length === 0) {
      return configuredTracePath;
    }

    const resolved = path.isAbsolute(configuredTracePath)
      ? configuredTracePath
      : path.resolve(projectDir, configuredTracePath);

    await fs.mkdir(path.dirname(resolved), { recursive: true });

    const serialized = traces.events
      .map((event) => JSON.stringify(event))
      .join("\n");

    await fs.writeFile(resolved, `${serialized}\n`, "utf-8");

    return resolved;
  }

  private logWithLevel(
    logger: Logger,
    level: "debug" | "info" | "warn" | "error",
    context: Record<string, unknown> | undefined,
    message: string
  ): void {
    switch (level) {
      case "debug":
        if (context) {
          logger.debug(context, message);
        } else {
          logger.debug(message);
        }
        return;
      case "warn":
        if (context) {
          logger.warn(context, message);
        } else {
          logger.warn(message);
        }
        return;
      case "error":
        if (context) {
          logger.error(context, message);
        } else {
          logger.error(message);
        }
        return;
      case "info":
      default:
        if (context) {
          logger.info(context, message);
        } else {
          logger.info(message);
        }
        return;
    }
  }

  private normalizeLevel(level?: string): "debug" | "info" | "warn" | "error" {
    switch (level) {
      case "debug":
      case "info":
      case "warn":
      case "error":
        return level;
      default:
        return "info";
    }
  }
}
