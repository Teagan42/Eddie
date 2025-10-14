# @eddie/context

A utility service for collecting source files and templated resources into an
LLM-friendly payload. The `ContextService` class powers the Eddie CLI and API by
packing codebases into a bounded context with consistent formatting.

## Installation

```bash
npm install @eddie/context
```

> **Note**: The service depends on `@eddie/io` and `@eddie/templates`. When
> using it outside of NestJS, instantiate those collaborators manually.

## Usage

```ts
import { ContextService } from "@eddie/context";
import { LoggerService } from "@eddie/io";
import { TemplateRendererService } from "@eddie/templates";

const logger = new LoggerService();
const templateRenderer = new TemplateRendererService();
const contextService = new ContextService(logger, templateRenderer);

const packed = await contextService.pack({
  baseDir: process.cwd(),
  include: ["src/**/*.ts"],
  resources: [
    {
      id: "system-message",
      type: "template",
      template: "system",
      variables: { project: "Eddie" },
    },
  ],
});

console.log(packed.totalBytes);
console.log(packed.text);
```

The `pack` method returns all matched files, derived resources, and a formatted
text block that can be sent to an LLM or stored alongside task metadata.

## Configuration

| Option | Type | Description |
| ------ | ---- | ----------- |
| `baseDir` | `string` | Directory to treat as the root when resolving glob patterns. Defaults to `process.cwd()`. |
| `include` | `string[]` | Glob patterns merged with the defaults to decide which files to consider. |
| `exclude` | `string[]` | Additional ignore patterns appended to the built-in cache/artifact filters. |
| `maxFiles` | `number` | Hard ceiling on how many files are emitted in the packed context. Defaults to 64. |
| `maxBytes` | `number` | Total byte budget across files and resources. Defaults to 250,000. |
| `variables` | `Record<string, unknown>` | Template variables shared by every resource of type `"template"`. |
| `resources` | `ContextResourceConfig[]` | Extra bundles or templates to load alongside source files. |

## Default behaviour

- **File budget**: Up to 64 files are collected before the service stops adding
  more.
- **Byte budget**: The service enforces a 250,000 bytes ceiling across files and
  resources, skipping entries beyond the limit. File sizes are checked with
  `fs.stat` before reading to avoid unnecessary I/O for oversized entries.
- **Include patterns**: Source files, documentation, configuration, and lock
  files are included by default. This mirrors the [`fast-glob`](https://github.com/mrmlnc/fast-glob)
  patterns in `ContextService` such as `**/*.{ts,tsx,js,jsx,json,md}`, Docker and
  Makefiles, environment files, and package manifests.
- **Exclude patterns**: Build artifacts and dependency caches (e.g.
  `node_modules`, `.git`, `dist`, `coverage`) are filtered out automatically.

Because the documentation reflects the implementation defaults, any override in
configuration should stay in sync with these lists.

## Resource loading

Resources let you enrich the packed context with additional text or bundled
files:

- **Template resources** (`type: "template"`) render a template via the
  `TemplateRendererService` and inject the result as text.
- **Bundle resources** (`type: "bundle"`) glob files from disk, normalise their
  paths, and embed both metadata and formatted file sections.

```ts
const packed = await contextService.pack({
  baseDir: process.cwd(),
  resources: [
    {
      id: "docs",
      type: "bundle",
      include: ["docs/**/*.md"],
      virtualPath: "documentation",
    },
  ],
});
```

When you provide a bundle resource, the optional `virtualPath` lets you control
the prefix that appears in the packed resource output. Internally each path is
normalised to POSIX separators before being combined with the `virtualPath`
value, mirroring the `ContextService` implementation.

When the `pack` method loads resources it respects the same byte budget, logging
skipped entries at debug level using `LoggerService`.

## NestJS integration

When consumed inside a NestJS application, add the exported providers to your
module:

```ts
import { Module } from "@nestjs/common";
import { ContextModule } from "@eddie/context";

@Module({
  imports: [ContextModule.forRoot()],
})
export class AppModule {}
```

The module wires `ContextService` with the default logger and template renderer
implementations, making it ready for dependency injection in your own services.
