# @eddie/templates

Utilities for rendering Nunjucks templates used across Eddie services.

## Template caching

`TemplateRendererService` caches compiled `nunjucks.Template` instances per
environment and template path. Each cache entry tracks the source file's last
modification time (`mtime`). When a template file changes on disk, the service
reloads the source and rebuilds the cached template before rendering so that
subsequent renders always include the latest content. If the metadata matches
the cached entry, the renderer skips reading the source again and reuses the
existing compiled template.
