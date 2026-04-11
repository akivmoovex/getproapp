"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { areAdminDbFixturesEnabled } = require("../src/admin/dbFixturesEnv");

test("areAdminDbFixturesEnabled: true when NODE_ENV is not production", () => {
  const prev = {
    n: process.env.NODE_ENV,
    a: process.env.GETPRO_ALLOW_DB_FIXTURES,
    p: process.env.GETPRO_ALLOW_DB_FIXTURES_IN_PRODUCTION,
  };
  process.env.NODE_ENV = "development";
  delete process.env.GETPRO_ALLOW_DB_FIXTURES;
  delete process.env.GETPRO_ALLOW_DB_FIXTURES_IN_PRODUCTION;
  try {
    assert.equal(areAdminDbFixturesEnabled(), true);
  } finally {
    if (prev.n !== undefined) process.env.NODE_ENV = prev.n;
    else delete process.env.NODE_ENV;
    if (prev.a !== undefined) process.env.GETPRO_ALLOW_DB_FIXTURES = prev.a;
    else delete process.env.GETPRO_ALLOW_DB_FIXTURES;
    if (prev.p !== undefined) process.env.GETPRO_ALLOW_DB_FIXTURES_IN_PRODUCTION = prev.p;
    else delete process.env.GETPRO_ALLOW_DB_FIXTURES_IN_PRODUCTION;
  }
});

test("areAdminDbFixturesEnabled: false in production without both flags", () => {
  const prev = {
    n: process.env.NODE_ENV,
    a: process.env.GETPRO_ALLOW_DB_FIXTURES,
    p: process.env.GETPRO_ALLOW_DB_FIXTURES_IN_PRODUCTION,
  };
  process.env.NODE_ENV = "production";
  delete process.env.GETPRO_ALLOW_DB_FIXTURES;
  delete process.env.GETPRO_ALLOW_DB_FIXTURES_IN_PRODUCTION;
  try {
    assert.equal(areAdminDbFixturesEnabled(), false);
  } finally {
    if (prev.n !== undefined) process.env.NODE_ENV = prev.n;
    else delete process.env.NODE_ENV;
    if (prev.a !== undefined) process.env.GETPRO_ALLOW_DB_FIXTURES = prev.a;
    else delete process.env.GETPRO_ALLOW_DB_FIXTURES;
    if (prev.p !== undefined) process.env.GETPRO_ALLOW_DB_FIXTURES_IN_PRODUCTION = prev.p;
    else delete process.env.GETPRO_ALLOW_DB_FIXTURES_IN_PRODUCTION;
  }
});

test("areAdminDbFixturesEnabled: false in production with only GETPRO_ALLOW_DB_FIXTURES", () => {
  const prev = {
    n: process.env.NODE_ENV,
    a: process.env.GETPRO_ALLOW_DB_FIXTURES,
    p: process.env.GETPRO_ALLOW_DB_FIXTURES_IN_PRODUCTION,
  };
  process.env.NODE_ENV = "production";
  process.env.GETPRO_ALLOW_DB_FIXTURES = "1";
  delete process.env.GETPRO_ALLOW_DB_FIXTURES_IN_PRODUCTION;
  try {
    assert.equal(areAdminDbFixturesEnabled(), false);
  } finally {
    if (prev.n !== undefined) process.env.NODE_ENV = prev.n;
    else delete process.env.NODE_ENV;
    if (prev.a !== undefined) process.env.GETPRO_ALLOW_DB_FIXTURES = prev.a;
    else delete process.env.GETPRO_ALLOW_DB_FIXTURES;
    if (prev.p !== undefined) process.env.GETPRO_ALLOW_DB_FIXTURES_IN_PRODUCTION = prev.p;
    else delete process.env.GETPRO_ALLOW_DB_FIXTURES_IN_PRODUCTION;
  }
});

test("areAdminDbFixturesEnabled: true in production when both flags are 1", () => {
  const prev = {
    n: process.env.NODE_ENV,
    a: process.env.GETPRO_ALLOW_DB_FIXTURES,
    p: process.env.GETPRO_ALLOW_DB_FIXTURES_IN_PRODUCTION,
  };
  process.env.NODE_ENV = "production";
  process.env.GETPRO_ALLOW_DB_FIXTURES = "1";
  process.env.GETPRO_ALLOW_DB_FIXTURES_IN_PRODUCTION = "1";
  try {
    assert.equal(areAdminDbFixturesEnabled(), true);
  } finally {
    if (prev.n !== undefined) process.env.NODE_ENV = prev.n;
    else delete process.env.NODE_ENV;
    if (prev.a !== undefined) process.env.GETPRO_ALLOW_DB_FIXTURES = prev.a;
    else delete process.env.GETPRO_ALLOW_DB_FIXTURES;
    if (prev.p !== undefined) process.env.GETPRO_ALLOW_DB_FIXTURES_IN_PRODUCTION = prev.p;
    else delete process.env.GETPRO_ALLOW_DB_FIXTURES_IN_PRODUCTION;
  }
});
