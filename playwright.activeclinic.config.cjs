"use strict";

const base = require("./playwright.config.cjs");

module.exports = {
  ...base,
  testMatch: ["tests/browser/v210-ac-smoke.spec.js"],
  testIgnore: [],
};
