# Eddie configuration

Eddie's runtime is driven by a strongly typed JSON schema that governs the
`eddie.config.*` files consumed by the CLI, API, and supporting tooling. Use the
configuration reference below to explore how sections such as `agents`,
`provider`, and `tools` fit together.

## Schema visualization

The configuration schema diagram is generated automatically from the
`EDDIE_CONFIG_SCHEMA_BUNDLE` source of truth. Run `npm run docs:config-schema`
to regenerate it after making schema changes.

- [View the Mermaid diagram](./generated/config-schema-diagram.md)
- [`packages/config/scripts/render-config-schema-diagram.ts`](../packages/config/scripts/render-config-schema-diagram.ts)
