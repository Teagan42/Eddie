import { loadConfig } from "../../config/loader";
import { packContext } from "../../core/context/packer";
import { makeTokenizer } from "../../core/tokenizers/strategy";
import { resolveCliOptions } from "../utils";

export async function context(
  options: Record<string, unknown>
): Promise<void> {
  const engineOptions = resolveCliOptions(options);
  const cfg = await loadConfig(engineOptions);
  const packed = await packContext(cfg.context);

  if (packed.files.length === 0) {
    console.log("No context files matched the current configuration.");
    return;
  }

  const tokenizer = makeTokenizer(cfg.tokenizer?.provider ?? cfg.provider.name);
  const tokens = tokenizer.countTokens(packed.text);

  console.log(`Context preview (${packed.files.length} files, ${packed.totalBytes} bytes, ~${tokens} tokens)`);
  console.log("────────────────────────────────────────────────────────");

  for (const file of packed.files) {
    console.log(`• ${file.path} (${file.bytes} bytes)`);
  }
}

