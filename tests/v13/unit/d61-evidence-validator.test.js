"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { validateReport, loadMatrix, caseRequirements } = require(
  "../../../QA/V213/AC_OVERNIGHT/D61/validate-acceptance-evidence.cjs"
);

const fixtureDir = path.join(
  __dirname,
  "../../../QA/V213/AC_OVERNIGHT/D61/fixtures"
);

function read(name) {
  return JSON.parse(fs.readFileSync(path.join(fixtureDir, name), "utf8"));
}

describe("D61 acceptance evidence validator", () => {
  const matrix = loadMatrix();

  it("rejects a PASS that has no database evidence and still claims release", () => {
    const result = validateReport(read("false-pass.json"), matrix);
    assert.equal(result.ok, false);
    assert.equal(result.failures.some((item) => item.code === "false_pass"), true);
    assert.equal(result.failures.some((item) => item.code === "release_blocked"), true);
    assert.equal(result.failures.some((item) => item.code === "missing_artifact"), true);
  });

  it("rejects a blocked security PASS, a skipped PASS, and a missing run id", () => {
    const result = validateReport(read("missing-and-skip.json"), matrix);
    assert.equal(result.ok, false);
    const codes = result.failures.map((item) => item.code);
    assert.equal(codes.includes("false_pass"), true);
    assert.equal(codes.includes("silent_skip"), true);
    assert.equal(codes.includes("missing_artifact"), true);
    assert.equal(
      result.failures.some((item) => item.acceptanceId === "APT-01-03"),
      true
    );
  });

  it("rejects a mock-only PASS even when the other evidence fields are filled in", () => {
    const requirements = matrix.map((record) => ({
      id: record.acceptance_id,
      ...caseRequirements(record),
    }));
    const target = requirements.find(
      (item) => !item.implementationMissing && !item.approvalBlocked && !item.concurrency && !item.authenticatedSecurity
    );
    assert.ok(target);
    const result = validateReport(
      {
        source_sha: "b8f6b420d25e908de64ba292866c218c32edc30c",
        run_id: "d67mock01",
        environment_identity: "testing",
        g2_execution: "PASS",
        g3_execution: "NOT_RUN",
        g4_execution: "ABSENT",
        release_ready: true,
        cases: {
          [target.id]: {
            status: "PASS",
            database_evidence: "VERIFIED",
            coverage: "MOCK_ONLY",
            authenticated_security_evidence: "NOT_REQUIRED",
            concurrency_evidence: "NOT_REQUIRED",
          },
        },
      },
      matrix
    );
    assert.equal(result.ok, false);
    assert.equal(
      result.failures.some(
        (item) => item.acceptanceId === target.id && item.detail.includes("coverage label")
      ),
      true
    );
    assert.equal(result.releaseBlocked, true);
  });

  it("accepts an honest not-run report and keeps the release blocked", () => {
    const result = validateReport(read("honest-not-run.json"), matrix);
    assert.equal(result.ok, true);
    assert.equal(result.passCount, 0);
    assert.equal(result.releaseBlocked, true);
  });
});
