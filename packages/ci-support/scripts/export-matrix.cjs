#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { loadWorkspaceMatrix } = require("../dist");

const matrices = {
  lint: loadWorkspaceMatrix("lint"),
  build: loadWorkspaceMatrix("build"),
  test: loadWorkspaceMatrix("test"),
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
