# Performance Benchmarks

The `@eddie/perf-benchmarks` workspace contains Vitest benchmark suites that
exercise hot code paths for Eddie's core packages. Benchmarks are intended to be
run locally when iterating on performance-sensitive changes and in CI for
regression detection.

## Prerequisites

1. Install dependencies at the repository root: `npm install`.
2. Ensure the TypeScript build artifacts are up to date if the benchmarks depend
   on compiled output (`npm run build --workspaces`).

## Running Benchmarks Locally

Run the workspace bench script through the root helper:

```bash
npm run bench
```

This proxies to the `@eddie/perf-benchmarks` package, which lints the benchmark
codebase and executes `vitest bench`. Benchmark files live in
[`packages/perf-benchmarks/bench`](../packages/perf-benchmarks/bench/) and use
the `*.bench.ts` suffix.

Vitest writes machine-readable results to
`packages/perf-benchmarks/reports/benchmark-results.json`. Delete this file when
starting a fresh run if you want to ensure only the latest results are present.

## Understanding the Output

Vitest prints human-friendly summaries to the terminal, highlighting the fastest
and slowest candidates along with relative percentage differences. The JSON
report mirrors the structure of Vitest's benchmark output and can be fed into CI
parsers or custom tooling. Each entry includes:

- `name` – the benchmark title.
- `rank` – ordering from fastest (`1`) to slowest.
- `hz` and `samples` – raw performance measurements collected by Tinybench.

To compare two runs, store previous JSON artifacts and use the
`--compare <file>` flag supported by `vitest bench`, or load both JSON files into
custom analysis scripts.

## Adding New Benchmarks

1. Create a new file under `packages/perf-benchmarks/bench/` with the
   `.bench.ts` extension.
2. Use Vitest's `bench()` API to describe each scenario and
   `runIf/skipIf` to guard environment-specific cases.
3. Keep setup code minimal and prefer fixtures from published packages via
   workspace path aliases (e.g. `@eddie/engine`).

Remember to document meaningful benchmark additions in package READMEs or ADRs
so teammates understand the scenarios being measured.
