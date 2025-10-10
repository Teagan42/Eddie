#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { loadWorkspaceMatrix } = require("../dist");

const changedEnv = process.env.CHANGED_WORKSPACES;
const changedWorkspaces = changedEnv ? JSON.parse(changedEnv) : undefined;
const options =
  changedWorkspaces === undefined
    ? undefined
    : { changedWorkspaces: changedWorkspaces ?? [] };

const matrices = {
  lint: loadWorkspaceMatrix("lint", options),
  build: loadWorkspaceMatrix("build", options),
  test: loadWorkspaceMatrix("test", options),
};

const outputPath = process.env.GITHUB_OUTPUT;

if (!outputPath) {
  process.stdout.write(JSON.stringify(matrices));
  process.exit(0);
}

const lines = Object.entries(matrices).map(([key, value]) =>
  `${key}=${JSON.stringify(value)}`
);

fs.appendFileSync(path.resolve(outputPath), `${lines.join("\n")}\n`);
