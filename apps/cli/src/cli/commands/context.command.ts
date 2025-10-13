import { Injectable } from "@nestjs/common";
import { ConfigService, ConfigStore } from "@eddie/config";
import { ContextService } from "@eddie/context";
import { TokenizerService } from "@eddie/tokenizers";
import { LoggerService } from "@eddie/io";
import type { CliArguments } from "../cli-arguments";
import { CliOptionsService } from "../cli-options.service";
import type { CliCommand, CliCommandMetadata } from "./cli-command";

@Injectable()
export class ContextCommand implements CliCommand {
  readonly metadata: CliCommandMetadata = {
    name: "context",
    description: "Preview packed context files and token counts.",
  };

  constructor(
    private readonly optionsService: CliOptionsService,
    configService: ConfigService,
    private readonly configStore: ConfigStore,
    private readonly loggerService: LoggerService,
    private readonly contextService: ContextService,
    private readonly tokenizerService: TokenizerService
  ) {
    void configService;
  }

  async execute(args: CliArguments): Promise<void> {
    const engineOptions = this.optionsService.parse(args.options);
    const cfg = this.configStore.getSnapshot();

    this.loggerService.configure({
      level: cfg.logging?.level ?? cfg.logLevel,
      destination: cfg.logging?.destination,
      enableTimestamps: cfg.logging?.enableTimestamps,
    });

    const logger = this.loggerService.getLogger("cli:context");
    logger.debug(
      { include: cfg.context.include, exclude: cfg.context.exclude },
      "Packing context preview"
    );

    const packed = await this.contextService.pack(cfg.context);
    if (packed.files.length === 0) {
      console.log("No context files matched the current configuration.");
      return;
    }

    const tokenizer = this.tokenizerService.create(
      cfg.tokenizer?.provider ?? cfg.provider.name
    );
    const tokens = tokenizer.countTokens(packed.text);

    console.log(
      `Context preview (${packed.files.length} files, ${packed.totalBytes} bytes, ~${tokens} tokens)`
    );
    console.log("────────────────────────────────────────────────────────");

    for (const file of packed.files) {
      console.log(`• ${file.path} (${file.bytes} bytes)`);
    }
  }
}
