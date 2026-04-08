"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { summarizeDatabaseUrlEnv } = require("../src/db/pg/pool");

test("summarizeDatabaseUrlEnv: neither set", () => {
  const prev = { d: process.env.DATABASE_URL, g: process.env.GETPRO_DATABASE_URL };
  delete process.env.DATABASE_URL;
  delete process.env.GETPRO_DATABASE_URL;
  try {
    assert.deepEqual(summarizeDatabaseUrlEnv(), {
      hasDatabaseUrl: false,
      hasGetproDatabaseUrl: false,
      effectiveSource: "(none)",
    });
  } finally {
    if (prev.d !== undefined) process.env.DATABASE_URL = prev.d;
    else delete process.env.DATABASE_URL;
    if (prev.g !== undefined) process.env.GETPRO_DATABASE_URL = prev.g;
    else delete process.env.GETPRO_DATABASE_URL;
  }
});

test("summarizeDatabaseUrlEnv: DATABASE_URL wins when both set", () => {
  const prev = { d: process.env.DATABASE_URL, g: process.env.GETPRO_DATABASE_URL };
  process.env.DATABASE_URL = "postgres://u:p@h/db";
  process.env.GETPRO_DATABASE_URL = "postgres://other/db";
  try {
    const s = summarizeDatabaseUrlEnv();
    assert.equal(s.hasDatabaseUrl, true);
    assert.equal(s.hasGetproDatabaseUrl, true);
    assert.equal(s.effectiveSource, "DATABASE_URL");
  } finally {
    if (prev.d !== undefined) process.env.DATABASE_URL = prev.d;
    else delete process.env.DATABASE_URL;
    if (prev.g !== undefined) process.env.GETPRO_DATABASE_URL = prev.g;
    else delete process.env.GETPRO_DATABASE_URL;
  }
});

test("summarizeDatabaseUrlEnv: only GETPRO_DATABASE_URL", () => {
  const prev = { d: process.env.DATABASE_URL, g: process.env.GETPRO_DATABASE_URL };
  delete process.env.DATABASE_URL;
  process.env.GETPRO_DATABASE_URL = "postgres://x/y";
  try {
    const s = summarizeDatabaseUrlEnv();
    assert.equal(s.hasDatabaseUrl, false);
    assert.equal(s.hasGetproDatabaseUrl, true);
    assert.equal(s.effectiveSource, "GETPRO_DATABASE_URL");
  } finally {
    if (prev.d !== undefined) process.env.DATABASE_URL = prev.d;
    else delete process.env.DATABASE_URL;
    if (prev.g !== undefined) process.env.GETPRO_DATABASE_URL = prev.g;
    else delete process.env.GETPRO_DATABASE_URL;
  }
});

test("summarizeDatabaseUrlEnv: whitespace-only counts as unset", () => {
  const prev = { d: process.env.DATABASE_URL, g: process.env.GETPRO_DATABASE_URL };
  process.env.DATABASE_URL = "   ";
  delete process.env.GETPRO_DATABASE_URL;
  try {
    const s = summarizeDatabaseUrlEnv();
    assert.equal(s.hasDatabaseUrl, false);
    assert.equal(s.effectiveSource, "(none)");
  } finally {
    if (prev.d !== undefined) process.env.DATABASE_URL = prev.d;
    else delete process.env.DATABASE_URL;
    if (prev.g !== undefined) process.env.GETPRO_DATABASE_URL = prev.g;
    else delete process.env.GETPRO_DATABASE_URL;
  }
});
