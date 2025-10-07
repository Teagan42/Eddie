import { ConfigService } from "../../config/loader";
import { ContextService } from "../../core/context/packer";
import { TokenizerService } from "../../core/tokenizers/strategy";
import { LoggerService } from "../../io/logger";
import { createCliApplicationContext, resolveCliOptions } from "../utils";

export async function context(
  options: Record<string, unknown>
): Promise<void> {
  const engineOptions = resolveCliOptions(options);
  const app = await createCliApplicationContext();
  try {
    const configService = app.get(ConfigService);
    const loggerService = app.get(LoggerService);
    const contextService = app.get(ContextService);
    const tokenizerService = app.get(TokenizerService);

    const cfg = await configService.load(engineOptions);
    loggerService.configure({
      level: cfg.logging?.level ?? cfg.logLevel,
      destination: cfg.logging?.destination,
      enableTimestamps: cfg.logging?.enableTimestamps,
    });
    const logger = loggerService.getLogger("cli:context");
    logger.debug({ include: cfg.context.include, exclude: cfg.context.exclude }, "Packing context preview");
    const packed = await contextService.pack(cfg.context);

    if (packed.files.length === 0) {
      console.log("No context files matched the current configuration.");
      return;
    }

    const tokenizer = tokenizerService.create(
      cfg.tokenizer?.provider ?? cfg.provider.name
    );
    const tokens = tokenizer.countTokens(packed.text);

    console.log(`Context preview (${packed.files.length} files, ${packed.totalBytes} bytes, ~${tokens} tokens)`);
    console.log("────────────────────────────────────────────────────────");

    for (const file of packed.files) {
      console.log(`• ${file.path} (${file.bytes} bytes)`);
    }
  } finally {
    await app.close();
  }
}
