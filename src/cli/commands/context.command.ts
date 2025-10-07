import { Injectable } from "@nestjs/common";
import { ConfigService } from "../../config/loader";
import { ContextService } from "../../core/context";
import { TokenizerService } from "../../core/tokenizers/strategy";
import { LoggerService } from "../../io/logger";
import type { CliArguments } from "../cli-arguments";
import { CliOptionsService } from "../cli-options.service";
import type { CliCommand } from "./cli-command";

@Injectable()
export class ContextCommand implements CliCommand {
  readonly name = "context";

  constructor(
    private readonly optionsService: CliOptionsService,
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly contextService: ContextService,
    private readonly tokenizerService: TokenizerService
  ) {}

  async run(args: CliArguments): Promise<void> {
    const engineOptions = this.optionsService.parse(args.options);
    const cfg = await this.configService.load(engineOptions);

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
