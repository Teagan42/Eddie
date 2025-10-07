import { context, trace } from "@opentelemetry/api";

export function startSpan(name: string) {
  const tracer = trace.getTracer("eddie-cli");
  const span = tracer.startSpan(name);
  return {
    end: () => span.end(),
    record: (key: string, value: unknown) => span.setAttribute(key, value as never),
    get context() {
      return context.active();
    },
  };
}

