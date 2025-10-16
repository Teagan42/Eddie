const path = require('node:path');

const baseConfig = require(path.resolve(__dirname, '../../../eslint.config.cjs'));

module.exports = [...baseConfig];
