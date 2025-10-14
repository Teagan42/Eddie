# API CQRS Guidelines

The NestJS CQRS package underpins feature orchestration inside `apps/api`. These notes pair the official [NestJS CQRS recipe](https://docs.nestjs.com/recipes/cqrs#installation) with Eddie-specific conventions so new handlers, buses, and modules remain consistent.

## Handler naming
- Command classes use the `<Verb><Resource>Command` suffix and live beside their DTOs. Their handlers are named `<Verb><Resource>CommandHandler` and decorated with `@CommandHandler(CommandName)`.
- Query classes follow the `<Resource><Detail>Query` pattern with `<Resource><Detail>QueryHandler` classes decorated with `@QueryHandler(QueryName)`.
- Domain events should end with `Event` and handlers with `EventHandler`. Always implement the appropriate `ICommandHandler`, `IQueryHandler`, or `IEventHandler` interface for clarity.
- File names stay in kebab-case (e.g., `create-chat-session.command.ts`, `create-chat-session.handler.ts`) to align with the rest of the API surface.

## Directory layout
- Group CQRS concerns under each feature: `apps/api/src/<feature>/application/commands|queries|events`. Place handlers under an inner `handlers/` folder when multiple handlers exist.
- Register all handlers in the owning feature module (`<feature>.module.ts`) and import Nest's `CqrsModule`. Re-export handler provider arrays for reuse in sub-modules.
- Inject buses (`CommandBus`, `QueryBus`, `EventBus`) from `@nestjs/cqrs` through constructors. Avoid reaching across features—cross-feature coordination should travel through commands, queries, or events.
- Keep DTOs and persistence adapters outside the application layer; handlers should orchestrate services and repositories without owning transport-specific logic.

## Testing expectations
- Cover each handler with unit tests via `@nestjs/testing`. Mock downstream services and assert the handler publishes or dispatches through the proper bus when applicable.
- Integration tests belong under `apps/api/test/integration`, standing up the feature module with `CqrsModule` to verify wiring between buses, handlers, and providers.
- Snapshot tests are discouraged; prefer explicit assertions on bus calls, emitted events, and returned DTOs.
- Verify package alignment: `@nestjs/cqrs` is currently pinned to `^11.0.0` (resolved to 11.0.3) in `apps/api/package.json`, matching the NestJS 11 baseline recommended by the docs. Upgrade in tandem with NestJS core releases.
