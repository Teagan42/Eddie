import { context, trace, type SpanAttributeValue } from "@opentelemetry/api";

export function startSpan(name: string) {
  const tracer = trace.getTracer("eddie-cli");
  const span = tracer.startSpan(name);
  return {
    end: () => span.end(),
    record: (key: string, value: SpanAttributeValue) => {
      span.setAttribute(key, value);
    },
    get context() {
      return context.active();
    },
  };
}

