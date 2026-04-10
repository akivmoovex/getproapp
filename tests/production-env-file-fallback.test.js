"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const { resetBootstrapForTests, runBootstrap } = require("../src/startup/bootstrap");

test("production: merges DATABASE_URL from GETPRO_PRODUCTION_ENV_FILE_FALLBACK (missing keys only)", () => {
  const prevNode = process.env.NODE_ENV;
  const prevDb = process.env.DATABASE_URL;
  const prevG = process.env.GETPRO_DATABASE_URL;
  const prevPath = process.env.GETPRO_PRODUCTION_ENV_FILE_FALLBACK;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "getpro-prodenv-"));
  const envFile = path.join(dir, ".env.production");
  fs.writeFileSync(envFile, "DATABASE_URL=postgres://localhost/getpro_prod_fallback_test\n", "utf8");

  process.env.NODE_ENV = "production";
  delete process.env.DATABASE_URL;
  delete process.env.GETPRO_DATABASE_URL;
  process.env.GETPRO_PRODUCTION_ENV_FILE_FALLBACK = envFile;
  resetBootstrapForTests();
  try {
    const b = runBootstrap();
    assert.equal(b.earlyProductionEnvLoaded, true);
    assert.ok(b.earlyProductionFileParsedKeys.includes("DATABASE_URL"));
    assert.equal(b.effectiveVarName, "DATABASE_URL");
    assert.equal(b.dbProvenance.kind, "production-file");
  } finally {
    try {
      fs.unlinkSync(envFile);
    } catch {
      /* ignore */
    }
    try {
      fs.rmdirSync(dir);
    } catch {
      /* ignore */
    }
    if (prevNode !== undefined) process.env.NODE_ENV = prevNode;
    else delete process.env.NODE_ENV;
    if (prevDb !== undefined) process.env.DATABASE_URL = prevDb;
    else delete process.env.DATABASE_URL;
    if (prevG !== undefined) process.env.GETPRO_DATABASE_URL = prevG;
    else delete process.env.GETPRO_DATABASE_URL;
    if (prevPath !== undefined) process.env.GETPRO_PRODUCTION_ENV_FILE_FALLBACK = prevPath;
    else delete process.env.GETPRO_PRODUCTION_ENV_FILE_FALLBACK;
    delete process.env.DATABASE_URL;
    resetBootstrapForTests();
  }
});

test("production: skips file merge when host has DATABASE_URL + SESSION_SECRET + BASE_DOMAIN", () => {
  const prevNode = process.env.NODE_ENV;
  const prevDb = process.env.DATABASE_URL;
  const prevS = process.env.SESSION_SECRET;
  const prevB = process.env.BASE_DOMAIN;
  const prevPath = process.env.GETPRO_PRODUCTION_ENV_FILE_FALLBACK;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "getpro-prodenv-skip-"));
  const envFile = path.join(dir, ".env.production");
  fs.writeFileSync(envFile, "DATABASE_URL=postgres://should-not-apply\nSESSION_SECRET=x\nBASE_DOMAIN=y\n", "utf8");

  process.env.NODE_ENV = "production";
  process.env.DATABASE_URL = "postgres://host-complete/getpro_skip_merge";
  process.env.SESSION_SECRET = "host-session";
  process.env.BASE_DOMAIN = "pronline.org";
  process.env.GETPRO_PRODUCTION_ENV_FILE_FALLBACK = envFile;
  resetBootstrapForTests();
  try {
    const b = runBootstrap();
    assert.equal(b.productionFileExists, true);
    assert.equal(b.productionFileMergeSkipped, true);
    assert.equal(b.productionFileLoaded, false);
    assert.equal(process.env.DATABASE_URL, "postgres://host-complete/getpro_skip_merge");
  } finally {
    try {
      fs.unlinkSync(envFile);
    } catch {
      /* ignore */
    }
    try {
      fs.rmdirSync(dir);
    } catch {
      /* ignore */
    }
    if (prevNode !== undefined) process.env.NODE_ENV = prevNode;
    else delete process.env.NODE_ENV;
    if (prevDb !== undefined) process.env.DATABASE_URL = prevDb;
    else delete process.env.DATABASE_URL;
    if (prevS !== undefined) process.env.SESSION_SECRET = prevS;
    else delete process.env.SESSION_SECRET;
    if (prevB !== undefined) process.env.BASE_DOMAIN = prevB;
    else delete process.env.BASE_DOMAIN;
    if (prevPath !== undefined) process.env.GETPRO_PRODUCTION_ENV_FILE_FALLBACK = prevPath;
    else delete process.env.GETPRO_PRODUCTION_ENV_FILE_FALLBACK;
    resetBootstrapForTests();
  }
});

test("production: Hostinger DATABASE_URL wins over production file (override false)", () => {
  const prevNode = process.env.NODE_ENV;
  const prevDb = process.env.DATABASE_URL;
  const prevPath = process.env.GETPRO_PRODUCTION_ENV_FILE_FALLBACK;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "getpro-prodenv2-"));
  const envFile = path.join(dir, ".env.production");
  fs.writeFileSync(envFile, "DATABASE_URL=postgres://file-wins-should-not\n", "utf8");

  process.env.NODE_ENV = "production";
  process.env.DATABASE_URL = "postgres://host-injected-wins/getpro_override_test";
  process.env.GETPRO_PRODUCTION_ENV_FILE_FALLBACK = envFile;
  resetBootstrapForTests();
  try {
    const b = runBootstrap();
    assert.equal(process.env.DATABASE_URL, "postgres://host-injected-wins/getpro_override_test");
    assert.equal(b.dbProvenance.kind, "host");
    assert.ok(!b.productionFileFilledKeys.includes("DATABASE_URL"));
  } finally {
    try {
      fs.unlinkSync(envFile);
    } catch {
      /* ignore */
    }
    try {
      fs.rmdirSync(dir);
    } catch {
      /* ignore */
    }
    if (prevNode !== undefined) process.env.NODE_ENV = prevNode;
    else delete process.env.NODE_ENV;
    if (prevDb !== undefined) process.env.DATABASE_URL = prevDb;
    else delete process.env.DATABASE_URL;
    if (prevPath !== undefined) process.env.GETPRO_PRODUCTION_ENV_FILE_FALLBACK = prevPath;
    else delete process.env.GETPRO_PRODUCTION_ENV_FILE_FALLBACK;
    resetBootstrapForTests();
  }
});
