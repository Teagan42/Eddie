import { Inject, Injectable } from "@nestjs/common";
import yaml from "yaml";
import {
  ConfigService,
  CONFIG_PRESET_NAMES,
  DEFAULT_CONFIG,
  getConfigPreset,
  type EddieConfigInput,
} from "@eddie/config";
import type { QuestionCollection } from "inquirer";
import type { CliArguments } from "../cli-arguments";
import type { CliCommand, CliCommandMetadata } from "./cli-command";

export type ConfigWizardPresetChoice =
  | (typeof CONFIG_PRESET_NAMES)[number]
  | "none";

export interface ConfigWizardAnswers {
  readonly preset: ConfigWizardPresetChoice;
  readonly format: "yaml" | "json";
  readonly projectDir: string;
  readonly model: string;
  readonly provider: string;
}

export interface ConfigWizardPrompter {
  prompt<T>(questions: QuestionCollection<T>): Promise<T>;
}

export const CONFIG_WIZARD_PROMPTER = Symbol("CONFIG_WIZARD_PROMPTER");

@Injectable()
export class InquirerConfigWizardPrompter implements ConfigWizardPrompter {
  async prompt<T>(questions: QuestionCollection<T>): Promise<T> {
    const { default: inquirer } = await import("inquirer");
    return inquirer.prompt<T>(questions);
  }
}

@Injectable()
export class ConfigCommand implements CliCommand {
  readonly metadata: CliCommandMetadata = {
    name: "config",
    description: "Launch a guided wizard to generate eddie.config files.",
  };

  constructor(
    private readonly configService: ConfigService,
    @Inject(CONFIG_WIZARD_PROMPTER)
    private readonly prompter: ConfigWizardPrompter
  ) {}

  async execute(args: CliArguments): Promise<void> {
    if (args.positionals.length > 0) {
      throw new Error("The config command does not accept positional arguments.");
    }

    const answers = await this.prompter.prompt<ConfigWizardAnswers>(
      this.createQuestions()
    );

    const input = this.buildConfigInput(answers);
    const source = this.serialiseInput(input, answers.format);

    const snapshot = await this.configService.writeSource(source, answers.format);

    if (snapshot.path) {
      console.log(`Configuration written to ${snapshot.path}`);
    }
  }

  private createQuestions(): QuestionCollection<ConfigWizardAnswers> {
    const hasPresets = CONFIG_PRESET_NAMES.length > 0;
    const presetChoices: ConfigWizardPresetChoice[] = hasPresets
      ? [...CONFIG_PRESET_NAMES, "none"]
      : ["none"];
    const defaultPreset: ConfigWizardPresetChoice = hasPresets
      ? CONFIG_PRESET_NAMES[0]
      : "none";

    return [
      {
        type: "list",
        name: "preset",
        message: "Which preset best matches your project?",
        choices: presetChoices.map((name) => ({
          name: name === "none" ? "None (start from defaults)" : name,
          value: name,
        })),
        default: defaultPreset,
      },
      {
        type: "list",
        name: "format",
        message: "Which file format should Eddie use?",
        choices: [
          { name: "YAML (eddie.config.yaml)", value: "yaml" },
          { name: "JSON (eddie.config.json)", value: "json" },
        ],
        default: "yaml",
      },
      {
        type: "input",
        name: "projectDir",
        message: "Where is your project located?",
        default: DEFAULT_CONFIG.projectDir,
      },
      {
        type: "input",
        name: "model",
        message: "Which model should Eddie use by default?",
        default: DEFAULT_CONFIG.model,
      },
      {
        type: "input",
        name: "provider",
        message: "Which provider should Eddie use?",
        default: DEFAULT_CONFIG.provider.name,
      },
    ];
  }

  private buildConfigInput(answers: ConfigWizardAnswers): EddieConfigInput {
    const presetName = answers.preset === "none" ? undefined : answers.preset;
    const base = presetName ? getConfigPreset(presetName) ?? {} : {};
    const result: EddieConfigInput = { ...base };

    const projectDir = answers.projectDir.trim();
    if (projectDir) {
      result.projectDir = projectDir;
    }

    const model = answers.model.trim();
    if (model) {
      result.model = model;
    }

    const provider = answers.provider.trim();
    if (provider) {
      result.provider = { ...(base.provider ?? {}), name: provider };
    }

    return result;
  }

  private serialiseInput(
    input: EddieConfigInput,
    format: ConfigWizardAnswers["format"],
  ): string {
    if (format === "json") {
      return `${JSON.stringify(input, null, 2)}\n`;
    }

    return yaml.stringify(input);
  }
}
