"use strict";

/**
 * V2.03 canonical QA baseline — local Postgres production-guard unit checks.
 * Does not connect to remote hosts; only validates URL refusal/allow logic.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  assertLocalNonProductionAdminUrl,
  resolveLocalAdminConnectionString,
  localDatabaseUrlForName,
} = require("./helpers/localPostgresAdmin");

describe("V2.03 local Postgres production DB guard", () => {
  it("allows canonical local admin URL", () => {
    const url = resolveLocalAdminConnectionString();
    const parsed = assertLocalNonProductionAdminUrl(url);
    assert.equal(parsed.database, "postgres");
    assert.ok(["127.0.0.1", "localhost", "::1"].includes(parsed.hostname));
    // Socket-preferring default uses ?host=/tmp (or explicit TCP :5432).
    assert.ok(
      String(url).includes("host=%2Ftmp") ||
        String(url).includes("host=/tmp") ||
        parsed.port === "5432"
    );
  });

  it("refuses remote / Hostinger / production-looking admin URLs", () => {
    const banned = [
      "postgresql://user:pass@hostinger-example.com:5432/postgres",
      "postgresql://user@db.pronline.org:5432/postgres",
      "postgresql://user@blessboard.com:5432/postgres",
      "postgresql://user@xxx.amazonaws.com:5432/postgres",
      "postgresql://user@127.0.0.1:5433/postgres",
      "postgresql://user@127.0.0.1:5432/production_app",
    ];
    for (const url of banned) {
      assert.throws(() => assertLocalNonProductionAdminUrl(url), /PRODUCTION_DB_GUARD/);
    }
  });

  it("builds local ephemeral DB URLs on the canonical local target", () => {
    const url = localDatabaseUrlForName("blessboard_ft_smoke_1");
    assert.match(url, /blessboard_ft_smoke_1/);
    assert.match(url, /127\.0\.0\.1/);
    assert.doesNotMatch(url, /hostinger|pronline|amazonaws/i);
  });
});
