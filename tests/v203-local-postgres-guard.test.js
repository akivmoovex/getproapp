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

  it("preserves password-authenticated admin URL properties", () => {
    const url = localDatabaseUrlForName(
      "blessboard_ft_password_1",
      "postgresql://ci_user:ci_password@127.0.0.1:5432/postgres"
    );
    const parsed = new URL(url);
    assert.equal(parsed.username, "ci_user");
    assert.equal(parsed.password, "ci_password");
    assert.equal(parsed.hostname, "127.0.0.1");
    assert.equal(parsed.port, "5432");
    assert.equal(parsed.pathname, "/blessboard_ft_password_1");
  });

  it("preserves URL-encoded password characters and connection options", () => {
    const url = localDatabaseUrlForName(
      "blessboard_ft_encoded_1",
      "postgresql://ci_user:p%40ss%3Aword%2F1@127.0.0.1:5432/postgres?sslmode=disable&application_name=acn20"
    );
    const parsed = new URL(url);
    assert.equal(decodeURIComponent(parsed.password), "p@ss:word/1");
    assert.match(parsed.toString(), /p%40ss%3Aword%2F1/);
    assert.equal(parsed.searchParams.get("sslmode"), "disable");
    assert.equal(parsed.searchParams.get("application_name"), "acn20");
    assert.equal(parsed.pathname, "/blessboard_ft_encoded_1");
  });

  it("preserves Unix-socket configuration and passwordless URLs", () => {
    const socketUrl = localDatabaseUrlForName(
      "blessboard_ft_socket_1",
      "postgresql://ci_user@127.0.0.1/postgres?host=%2Ftmp"
    );
    const socketParsed = new URL(socketUrl);
    assert.equal(socketParsed.searchParams.get("host"), "/tmp");
    assert.equal(socketParsed.pathname, "/blessboard_ft_socket_1");

    const passwordless = localDatabaseUrlForName(
      "blessboard_ft_passwordless_1",
      "postgresql://127.0.0.1:5432/postgres"
    );
    const passwordlessParsed = new URL(passwordless);
    assert.equal(passwordlessParsed.username, "");
    assert.equal(passwordlessParsed.password, "");
    assert.equal(passwordlessParsed.pathname, "/blessboard_ft_passwordless_1");
  });

  it("rejects unsafe names and unsafe administrator URLs", () => {
    assert.throws(
      () => localDatabaseUrlForName("not-safe-name", "postgresql://ci_user@127.0.0.1:5432/postgres"),
      /unsafe local database name/
    );
    assert.throws(
      () => localDatabaseUrlForName("blessboard_ft_bad_1", "postgresql://ci_user@remote.example:5432/postgres"),
      /PRODUCTION_DB_GUARD/
    );
    assert.throws(
      () => localDatabaseUrlForName("blessboard_ft_bad_2", "postgresql://ci_user@127.0.0.1:5432/qa_shared"),
      /PRODUCTION_DB_GUARD/
    );
  });
});
