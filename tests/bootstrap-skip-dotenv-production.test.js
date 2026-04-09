"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { resetBootstrapForTests, runBootstrap } = require("../src/startup/bootstrap");

test("runBootstrap: skips dotenv merge when NODE_ENV=production", () => {
  const prev = process.env.NODE_ENV;
  const prevSkip = process.env.GETPRO_SKIP_DOTENV;
  process.env.NODE_ENV = "production";
  delete process.env.GETPRO_SKIP_DOTENV;
  resetBootstrapForTests();
  try {
    const b = runBootstrap();
    assert.equal(b.dotenvSkippedForProduction, true);
    assert.equal(b.skipDotenv, true);
    assert.equal(b.dotenvKeyCount, 0);
  } finally {
    if (prev !== undefined) process.env.NODE_ENV = prev;
    else delete process.env.NODE_ENV;
    if (prevSkip !== undefined) process.env.GETPRO_SKIP_DOTENV = prevSkip;
    else delete process.env.GETPRO_SKIP_DOTENV;
    resetBootstrapForTests();
  }
});
