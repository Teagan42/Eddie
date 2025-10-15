# Performance Benchmarks

The performance benchmarks workspace exercises hot paths in Eddie's runtime to
track regressions across releases. Benchmarks run with [Vitest's benchmark
runner](https://vitest.dev/guide/benchmark) so the tooling stays consistent with
the rest of the monorepo.

## Running Locally

```bash
npm run bench
```

The root script proxies to `@eddie/perf-benchmarks`, which discovers benchmark
files under `packages/perf-benchmarks/benchmarks/**`. Each benchmark should be
named with the `.bench.ts` suffix so `vitest bench` can find it automatically.

## Reading the Results

Vitest renders the familiar terminal summary while the configured reporter also
writes a machine-readable JSON artifact to `packages/perf-benchmarks/benchmarks/results.json`.
Commit this file to CI artifacts (not to the repo) so you can compare historical
runs with `vitest bench --compare <path-to-json>`. The JSON payload includes
statistical details such as average, median, and variance per case. Use those
figures to confirm new implementations are faster—or to detect when they slow
things down.

For ad-hoc analysis you can feed the JSON file into custom scripts or dashboards
that plot operations per second over time.
