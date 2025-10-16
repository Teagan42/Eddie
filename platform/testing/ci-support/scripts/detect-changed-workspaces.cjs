#!/usr/bin/env node
const { execFileSync } = require("node:child_process");

const { selectWorkspaceNamesForPaths } = require("../dist");

const [baseArg, headArg] = process.argv.slice(2);
const base = baseArg && baseArg.trim().length > 0 ? baseArg : undefined;
const head = headArg && headArg.trim().length > 0 ? headArg : undefined;

const diffRange = base ? `${base}...${head ?? "HEAD"}` : head ?? "HEAD";

const diffOutput = execFileSync("git", [
  "diff",
  "--name-only",
  "--diff-filter=ACMR",
  diffRange,
], {
  encoding: "utf8",
});

const files = diffOutput
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line.length > 0);

const names = selectWorkspaceNamesForPaths(files);

process.stdout.write(JSON.stringify(names));
