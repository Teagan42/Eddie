# Hooks runtime package

The hooks runtime wires user-provided modules into Eddie's `HookBus` so custom
logic can observe and influence agent behaviour. Two NestJS services make this
possible:

- **`HooksService`** – orchestrates hook loading at runtime. It creates a
  `HookBus` through the injected `HookBusFactory`, resolves each configured hook
  module, and registers the handlers that module exposes. Failures to load a
  module or unexpected export shapes are reported with Nest's `Logger`, ensuring
  the hosting application surfaces actionable diagnostics.
- **`HooksLoaderService`** – performs resolution and attachment of individual
  modules. It handles CommonJS and ESM packages, normalises legacy export
  formats, and emits warnings when handlers are missing, deprecated, or invalid.

## Supported hook module exports

Hook modules are expected to export either a function installer or an object map
of event handlers.

### `HookInstaller`

A `HookInstaller` is a function that receives the shared `HookBus` and a
`LoggerService`. Installers may register any listeners they need, and can be
async if setup requires I/O.

```ts
import type { HookBus } from "@eddie/hooks";
import type { LoggerService } from "@nestjs/common";

export default async function install(bus: HookBus, logger: LoggerService) {
  bus.on("sessionStart", async (event) => {
    logger.log(`Session ${event.sessionId} is starting`);
  });
}
```

### Event handler object

Alternatively, modules may export an object implementing
`HookEventHandlers`. Each property corresponds to a hook event, and the loader
attaches each function directly to the bus.

```ts
import type { HookEventHandlers } from "@eddie/types";

export const hooks: HookEventHandlers = {
  sessionStart: async ({ sessionId }) => {
    console.log("session started", sessionId);
  },
  postToolUse: async ({ tool, result }) => {
    console.log(`tool ${tool.name} returned`, result);
  },
};
```

The loader also understands several legacy event names, translating them to the
current event constants from `@eddie/types` while warning about the
deprecation:

| Legacy name             | Current event                |
| ----------------------- | ---------------------------- |
| `SessionStart`          | `sessionStart`               |
| `UserPromptSubmit`      | `userPromptSubmit`           |
| `SessionEnd`            | `sessionEnd`                 |
| `PreCompact`            | `preCompact`                 |
| `PreToolUse`            | `preToolUse`                 |
| `BeforeSpawnSubagent`   | `beforeSpawnSubagent`        |
| `PostToolUse`           | `postToolUse`                |
| `Notification`          | `notification`               |
| `Stop`                  | `stop`                       |
| `SubagentStop`          | `subagentStop`               |

Handlers that are undefined, not functions, or refer to unknown event names are
skipped with a warning in the Nest logger.

## Configuration inputs

Hook loading is controlled by the `HooksConfig` entry in the runtime
configuration. The `HooksService` inspects two properties:

- `hooks.modules` – an ordered array of module specifiers. Each entry can be a
  package name or a relative path. Modules are loaded sequentially; failures for
  one module are logged and do not prevent later modules from running.
- `hooks.directory` – an optional base directory used when resolving relative
  module specifiers. When omitted, resolution falls back to the current working
  directory of the hosting process.

Both settings can be supplied via `eddie.config.*` files or programmatically
when bootstrapping the runtime.

## Installing custom modules

A typical project places hook modules alongside the Eddie configuration and
references them from `hooks.modules`:

```json
{
  "hooks": {
    "directory": "./hooks",
    "modules": ["./audit-logger", "@acme/agent-hooks"]
  }
}
```

With this configuration, Eddie loads `./hooks/audit-logger` relative to the
configuration directory, then loads the published `@acme/agent-hooks` package.
Each module may export either a `HookInstaller` or an event map as described
above.

Hook installers can leverage the provided `LoggerService` to surface structured
logging through NestJS. The runtime also emits warnings when a module exports an
unexpected shape and logs errors (with stack traces when available) if a module
throws during resolution or execution. These messages flow through Nest's
standard logging pipeline, making them visible in CLI output and any configured
transport such as application insights or file loggers.
