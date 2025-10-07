# Changelog

## [Unreleased]

### Changed
- Refactored the CLI bootstrap to run inside a Nest application context, ensuring dependency-injected command runners and shared services.

### Added
- Integration tests covering the Nest-backed command runner and CLI argument parsing parity.
- Migration guide documenting environment variables, configuration lookups, and build steps for downstream consumers.
