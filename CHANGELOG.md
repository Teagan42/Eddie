# Changelog

## [Unreleased]

### Changed
- Refactored the CLI bootstrap to run inside a Nest application context, ensuring dependency-injected command runners and shared services.

### Added
- Integration tests covering the Nest-backed command runner and CLI argument parsing parity.
- Migration guide documenting environment variables, configuration lookups, and build steps for downstream consumers.

## [1.0.1] - 2025-10-07

### Changed
- Moved `EngineService` and related types into `src/core/engine/engine.service.ts` with a barrel export for downstream consumers.
