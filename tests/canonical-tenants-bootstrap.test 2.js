"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { CANONICAL_TENANT_SEED_ROWS } = require("../src/db/pg/tenantsRepo");

test("canonical tenant bootstrap seed includes demo (id 2)", () => {
  const demo = CANONICAL_TENANT_SEED_ROWS.find((row) => row[1] === "demo");
  assert.ok(demo);
  assert.equal(demo[0], 2);
  assert.equal(demo[1], "demo");
});

test("canonical tenant bootstrap seed includes zm and il", () => {
  const slugs = CANONICAL_TENANT_SEED_ROWS.map((r) => r[1]);
  assert.ok(slugs.includes("zm"));
  assert.ok(slugs.includes("il"));
});
