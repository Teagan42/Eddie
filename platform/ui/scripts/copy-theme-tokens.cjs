const { copyFileSync, mkdirSync } = require("node:fs");
const { dirname, resolve } = require("node:path");

const source = resolve(__dirname, "../src/theme/tokens.css");
const destination = resolve(__dirname, "../dist/theme/tokens.css");

mkdirSync(dirname(destination), { recursive: true });
copyFileSync(source, destination);
