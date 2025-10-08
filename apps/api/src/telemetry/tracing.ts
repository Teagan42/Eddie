import { diag, DiagConsoleLogger, DiagLogLevel } from "@opentelemetry/api";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { ConsoleSpanExporter } from "@opentelemetry/sdk-trace-base";
import { Resource } from "@opentelemetry/resources";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";

let sdk: NodeSDK | null = null;
let initializing: Promise<void> | null = null;

function createSdk(): NodeSDK {
  return new NodeSDK({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: "eddie-api",
    }),
    traceExporter: new ConsoleSpanExporter(),
    instrumentations: [getNodeAutoInstrumentations()],
  });
}

export async function initTracing(): Promise<void> {
  if (sdk) {
    return;
  }
  if (initializing) {
    return initializing;
  }

  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ERROR);

  const instance = createSdk();
  sdk = instance;
  const startPromise = Promise.resolve(instance.start()).catch((error: unknown) => {
    sdk = null;
    throw error;
  });
  initializing = startPromise;

  try {
    await startPromise;
  } finally {
    initializing = null;
  }

  const shutdown = async () => {
    if (!sdk) {
      return;
    }
    try {
      await sdk.shutdown();
    } catch (error) {
      diag.error("Failed to shut down OpenTelemetry SDK", error);
    }
  };

  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}
