# Dependency Injection Best Practices

This guide distills the dependency injection expectations captured in
[`platform/AGENTS.md`](../platform/AGENTS.md) and shows how existing packages
apply them in practice. Follow these patterns whenever you add new modules or
providers so consumers enjoy the same ergonomics inside and outside NestJS.

## Constructor injection first

Use constructor injection to make dependencies explicit and allow plain
TypeScript usage. The `@eddie/config` package demonstrates this pattern by
injecting tokens for optional collaborators and only reading configuration from
arguments supplied by the host application. The `ConfigService` constructor pulls
in the configuration store, module options, defaults provider, and resolved file
path exclusively through its signature, making it easy to use without a Nest
container.【F:platform/core/config/src/config.service.ts†L1-L89】 The `EngineService`
in `@eddie/engine` follows the same approach by depending on the config store,
context service, provider factory, tokenizer, and IO services through
constructor parameters instead of hidden lookups.【F:platform/runtime/engine/src/engine.service.ts†L1-L80】

When constructing helpers or factories, keep constructor arguments interface-
based so they can be satisfied by both NestJS providers and plain objects during
unit tests. Avoid property injection or service locators; they make contracts
harder to trace and break when the module is reused outside Nest.

## Document and export injection tokens

Every token must be exported alongside its type so consuming modules can supply
overrides. The `@eddie/config` module exposes tokens such as
`MODULE_OPTIONS_TOKEN` and `CONFIG_FILE_PATH_TOKEN` for runtime options and file
path resolution, allowing applications to customise configuration sources while
keeping Nest optional.【F:platform/core/config/src/config.module.ts†L1-L56】 Likewise,
`@eddie/providers` centralises its provider adapter factories behind the
`PROVIDER_ADAPTER_FACTORIES` symbol so hosts can register custom adapters without
reaching into internal files.【F:platform/integrations/providers/src/provider.tokens.ts†L1-L11】【F:platform/integrations/providers/src/providers.module.ts†L1-L48】
Document tokens next to their exports and explain expected values in package
READMEs or inline comments to keep injection surfaces self-explanatory.

## Respect module boundaries

Modules should only expose cohesive capabilities and re-export the tokens other
packages need. `ConfigModule` sets up the configuration namespace and exposes
its configurable module options while remaining globally scoped for downstream
modules.【F:platform/core/config/src/config.module.ts†L1-L61】 `ProvidersModule` groups
all adapter factories and only exports the `ProviderFactoryService` so other
packages can request adapters without depending on individual implementations.
The engine consumes those boundaries by accepting `ProviderFactoryService` in
its constructor instead of importing provider classes directly, preserving the
layering outlined in the package contribution guide.【F:platform/runtime/engine/src/engine.service.ts†L1-L80】

When creating new modules, avoid deep imports from sibling packages. Wire
cross-package dependencies through their public entry points and ensure tokens
are re-exported at the root so consumers never have to reach into `dist/` paths.
Document any new dependency edge in the package README as part of your change.

## Testing strategies

Tests should mirror the strategies described in `platform/AGENTS.md`: use
Vitest for unit coverage, prefer lightweight fakes, and assert contracts in
plain TypeScript contexts. For example, the config package verifies that its
service composes runtime layers without relying on NestJS helpers, while engine
and provider tests create fake adapters to assert streaming behaviour through
async iterables. When adding new DI features, write tests that exercise the
constructor API directly and supply explicit tokens so regressions are caught
before integration tests run.

Keep tests deterministic and avoid accessing the filesystem or environment
variables unless the package surface explicitly models those interactions.
Verify that optional dependencies are handled gracefully by instantiating the
class with minimal arguments and asserting default behaviour. These patterns
make documentation expectations enforceable by automated checks like
`tests/di-best-practices-docs.test.ts`.
