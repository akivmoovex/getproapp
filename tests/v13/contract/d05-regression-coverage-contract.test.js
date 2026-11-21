"use strict";

/**
 * Source contract for D05 coverage. Does not load the runners: supertest is
 * declared but not installed in this worktree.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

const RUNNERS = [
  ["AC-WEB-08", "runAcWeb08"],
  ["AC-WEB-09", "runAcWeb09"],
  ["AC-REC-02", "runAcRec02"],
  ["AC-REC-03", "runAcRec03"],
  ["AC-PUB-01", "runAcPub01"],
  ["BB-WEB-08", "runBbWeb08"],
  ["BB-WEB-09", "runBbWeb09"],
  ["BB-WEB-10", "runBbWeb10"],
  ["BB-ANN-02", "runBbAnn02"],
];

describe("D05 regression coverage contract", () => {
  it("maps each remaining bug to a gated HTTP runner and skips unauthorized runs", () => {
    const runner = read("tests/v13/integration/d05RegressionRunners.js");
    const suite = read("tests/v13/integration/d05-regression.integration.test.js");
    assert.match(suite, /t\.skip\(`NOT_RUN:/);
    assert.match(suite, /runGated/);
    assert.doesNotMatch(suite, /assert\.fail/);
    assert.doesNotMatch(suite, /assert\.equal\(true,\s*true\)/);
    for (const [bugId, name] of RUNNERS) {
      assert.match(runner, new RegExp(`async function ${name}\\(`));
      assert.match(suite, new RegExp(bugId));
      assert.match(suite, new RegExp(name));
    }
    assert.match(runner, /PENDING_PRODUCT_SCOPE/);
    assert.match(runner, /Online booking is not enabled/);
    assert.match(runner, /invalid_theme/);
    assert.match(runner, /does not take live bookings/);
    assert.doesNotMatch(runner, /name="coupon_code"/);
    assert.doesNotMatch(runner, /require\(["']resend|twilio|infobip["']\)/);
  });

  it("keeps the new browser journeys behind hold before navigation", () => {
    const ac = read("tests/e2e/v13/v13-ac-platform-qa.spec.js");
    const bb = read("tests/e2e/v13/v13-bb-qa-regression.spec.js");
    for (const bugId of ["AC-WEB-08", "AC-WEB-09", "AC-REC-02", "AC-REC-03", "AC-PUB-01"]) {
      const start = ac.indexOf(`test("${bugId}`);
      assert.ok(start > 0, bugId);
      const body = ac.slice(start, start + 500);
      const holdAt = body.indexOf("hold(");
      const gotoAt = body.indexOf("page.goto");
      assert.ok(holdAt >= 0 && (gotoAt === -1 || holdAt < gotoAt), bugId);
    }
    for (const bugId of ["BB-WEB-08", "BB-WEB-09", "BB-WEB-10", "BB-ANN-02"]) {
      const start = bb.indexOf(`test("${bugId}`);
      assert.ok(start > 0, bugId);
      const body = bb.slice(start, start + 500);
      const holdAt = body.indexOf("hold(");
      const gotoAt = body.indexOf("page.goto");
      assert.ok(holdAt >= 0 && (gotoAt === -1 || holdAt < gotoAt), bugId);
    }
    assert.match(ac, /Booking not available/);
    assert.doesNotMatch(ac, /name='coupon_code'/);
    assert.match(bb, /data-bb-sermons-form/);
    assert.match(bb, /data-bb-events-form/);
  });
});
