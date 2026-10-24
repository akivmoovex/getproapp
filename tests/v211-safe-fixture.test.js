"use strict";

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const {
  APPROVED_URL,
  assertExplicitApprovedUrl,
  verifyV211Sandbox,
  ownedKey,
} = require("./helpers/v211SafeFixture");

describe("V2.11 non-destructive fixture guard", () => {
  it("accepts only the explicit approved URL", () => {
    assert.doesNotThrow(() => assertExplicitApprovedUrl("DATABASE_URL", APPROVED_URL));
    assert.throws(
      () => assertExplicitApprovedUrl("DATABASE_URL", "postgresql://localhost:5432/getpro_v211_test_01"),
      /must explicitly equal/
    );
  });

  it("rejects production before opening a database connection", async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    await assert.rejects(
      verifyV211Sandbox({ databaseUrl: APPROVED_URL, testDatabaseUrl: APPROVED_URL, pool: { query: async () => {
        throw new Error("database must not be opened");
      } } }),
      /production environment/
    );
    process.env.NODE_ENV = previous;
  });

  it("rejects incomplete schema and wrong identity without migration", async () => {
    const incomplete = { query: async () => ({ rows: [] }) };
    await assert.rejects(
      verifyV211Sandbox({ databaseUrl: APPROVED_URL, testDatabaseUrl: APPROVED_URL, pool: incomplete }),
      /required V2.11 schema missing/
    );
  });

  it("creates unique owned identifiers without database cleanup", () => {
    const first = ownedKey();
    const second = ownedKey();
    assert.notEqual(first, second);
    assert.match(first, /^qa70-\d+-\d+-[a-z0-9]+$/);
  });
});
