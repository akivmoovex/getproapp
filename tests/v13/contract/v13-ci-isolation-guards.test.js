"use strict";

/**
 * Nonmutating CI isolation and result-taxonomy guards for V13.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  assertV13CiDatabaseUrl,
  assertV13CiEnvironmentIdentity,
  assertDbWritingStagesAuthorized,
  buildOwnedDatabaseName,
  assertOwnedDisposableDatabaseName,
} = require("../helpers/v13CiDatabaseGuard");
const {
  RESULTS,
  buildResultRow,
  evaluateReleaseReadiness,
} = require("../helpers/v13QaStatus");
const { dbWritesAuthorized } = require("../helpers/v13DbWriteGate");

const ROOT = path.join(__dirname, "../../..");

describe("V13 CI isolation guards", () => {
  it("accepts owned disposable local CI database URLs", () => {
    const name = buildOwnedDatabaseName("abcdef123456", "bb_qa");
    const parsed = assertV13CiDatabaseUrl(
      `postgresql://postgres:postgres@127.0.0.1:5432/${name}`,
      { expectedDatabaseName: name }
    );
    assert.equal(parsed.database, name);
  });

  it("rejects production hosts, shared QA names, and unexpected databases", () => {
    assert.throws(
      () =>
        assertV13CiDatabaseUrl(
          "postgresql://u:p@db.blessboard.com:5432/getpro_v13_ci_abcdef12"
        ),
      /refusing/
    );
    assert.throws(
      () =>
        assertV13CiDatabaseUrl(
          "postgresql://postgres:postgres@127.0.0.1:5432/getpro_ci"
        ),
      /shared|refusing/
    );
    assert.throws(() => assertOwnedDisposableDatabaseName("postgres"), /refusing/);
    assert.throws(() => assertOwnedDisposableDatabaseName("shared_qa"), /refusing/);
  });

  it("requires testing identity env markers", () => {
    assert.throws(() => assertV13CiEnvironmentIdentity({}), /GETPRO_V13_CI_RUN_ID/);
    const ok = assertV13CiEnvironmentIdentity({
      GETPRO_V13_CI_RUN_ID: "run-abcdef12",
      DATABASE_IDENTITY_ENV: "testing",
      GETPRO_TEST_DB: "1",
      NODE_ENV: "test",
    });
    assert.equal(ok.envCode, "testing");
  });

  it("keeps database-writing stages unauthorized by default", () => {
    assert.equal(dbWritesAuthorized({}), false);
    assert.throws(() => assertDbWritingStagesAuthorized({}), /not authorized/);
    assert.equal(
      assertDbWritingStagesAuthorized({
        GETPRO_V13_ALLOW_DB_WRITES: "1",
        GETPRO_V13_DB_STAGES_AUTHORIZED: "1",
      }),
      true
    );
  });

  it("release readiness stays blocked while required regressions remain open", () => {
    const matrix = JSON.parse(
      fs.readFileSync(path.join(ROOT, "docs/qa/V213_BB_REGRESSION_MATRIX.json"), "utf8")
    );
    const decision = evaluateReleaseReadiness(
      [
        buildResultRow({
          BUG_ID: "SANITY-06",
          TEST_NAME: "version",
          TEST_LEVEL: "UNIT",
          RESULT: RESULTS.PASS,
          required: false,
        }),
      ].map((r) => ({ ...r, required: false })),
      matrix.releaseBlockers
    );
    assert.equal(decision.ready, false);
    assert.equal(decision.conclusion, "RELEASE_BLOCKED");
    assert.ok(decision.openBlockers.includes("BB-05"));
  });

  it("does not certify a required row that was not run or was skipped", () => {
    const missing = evaluateReleaseReadiness(
      [{ BUG_ID: "D67", TEST_NAME: "held", required: true, RESULT: RESULTS.NOT_RUN }],
      []
    );
    assert.equal(missing.ready, false);
    assert.equal(missing.failingRequired.includes("D67"), true);
    const skipped = evaluateReleaseReadiness(
      [{ BUG_ID: "D67-SKIP", TEST_NAME: "skip", required: true, RESULT: "SKIPPED" }],
      []
    );
    assert.equal(skipped.ready, false);
    const passed = evaluateReleaseReadiness(
      [{ BUG_ID: "D67-PASS", TEST_NAME: "pass", required: true, RESULT: RESULTS.PASS }],
      []
    );
    assert.equal(passed.ready, true);
    assert.equal(passed.conclusion, "RELEASE_READY");
  });

  it("workflow files exist and do not enable DB stages by default", () => {
    for (const rel of [
      ".github/workflows/v13-bb-qa-regression.yml",
      ".github/workflows/v13-bb-bug-regressions.yml",
      ".github/workflows/v13-ac-qa-regression.yml",
      ".github/workflows/v13-platform-qa-regression.yml",
    ]) {
      const wf = fs.readFileSync(path.join(ROOT, rel), "utf8");
      assert.match(wf, /workflow_dispatch/);
      assert.match(wf, /enable_db_stages/);
      assert.match(wf, /default:\s*false|CI_DATABASE_WRITING_ENABLED/);
      assert.match(wf, /GETPRO_V13_ALLOW_DB_WRITES/);
      assert.doesNotMatch(wf, /on:\s*\n\s*push:/);
      assert.doesNotMatch(wf, /on:\s*\n\s*pull_request:/);
    }
  });
});
