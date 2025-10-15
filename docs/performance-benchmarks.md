# Performance Benchmarks

The `@eddie/perf-benchmarks` workspace provides reproducible micro-benchmarks
for critical subsystems. The `ContextService.pack` benchmark suite exercises the
full context-pack pipeline so regressions in file traversal, resource packing,
and template rendering can be tracked over time.

Run the suite locally with:

```
npm run bench --workspace @eddie/perf-benchmarks
```

## Context pack scenarios

`context-pack.bench.ts` builds a set of representative project directories once
per suite and reuses them across benchmark iterations to avoid skew from fixture
generation. The current matrix covers three growth profiles plus a resource
bundle variant:

| Scenario       | Files | Bytes per file | Resource bundles | Notes                              |
| -------------- | ----- | -------------- | ---------------- | ---------------------------------- |
| `10x1KB`       | 10    | 1 KiB          | None             | Minimal project footprint.         |
| `100x10KB`     | 100   | 10 KiB         | None             | Medium-sized repository snapshot.  |
| `500x100KB`    | 500   | 100 KiB        | 1 × 256 KiB      | Large pack including bundle I/O.   |

Each dataset records the mean, min, and max execution time across iterations
and calculates throughput metrics:

- **files/sec** – processed source files per second.
- **bytes/sec** – cumulative bytes read or rendered per second.
- **bundle bytes** – additional payload packed from resource bundles.

The benchmark emits a structured JSON payload summarising the scenarios so CI
jobs can compare performance between commits. Consumers can parse the output for
trend analysis, guardrails, or dashboards.

Future additions should extend the matrix (for example, repositories with
binary-heavy content or deeply nested folder structures) and document the new
entries in the table above.
