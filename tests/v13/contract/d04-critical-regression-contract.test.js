"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { dbWritesAuthorized } = require("../helpers/v13DbWriteGate");

const ROOT = path.join(__dirname, "../../..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const BUGS = [
  ["AC-AUTH-04", "runAcAuth04"],
  ["BB-AUTH-04", "runBbAuth04"],
  ["BB-MEM-02", "runBbMem02"],
  ["AC-REG-01", "runAcReg01"],
  ["BB-REG-07", "runBbReg07"],
  ["BB-MEM-01", "runBbMem01"],
  ["BB-ANN-01", "runBbAnn01"],
];

describe("D04 critical regression contract", () => {
  it("maps each bug to a gated HTTP runner and a browser journey", () => {
    const integration = read("tests/v13/integration/d04-critical-regression.integration.test.js");
    const runners = read("tests/v13/integration/d04CriticalRegressionRunners.js");
    const bb = read("tests/e2e/v13/v13-bb-qa-regression.spec.js");
    const ac = read("tests/e2e/v13/v13-ac-platform-qa.spec.js");
    assert.match(integration, /t\.skip\(`NOT_RUN:/);
    assert.match(integration, /V13_RESULT=\$\{RESULTS\.NOT_RUN\}/);
    assert.match(integration, /runGated/);
    assert.doesNotMatch(integration, /assert\.fail/);
    assert.doesNotMatch(integration, /assert\.equal\(true,\s*true\)/);
    assert.doesNotMatch(runners, /BLESSBOARD_OTP_EXPOSE_TEST_CODE\s*=\s*"1"/);
    assert.match(runners, /delete env\.RESEND_API_KEY/);
    assert.doesNotMatch(runners, /require\([^)]*(?:resend|twilio|infobip)/i);
    assert.doesNotMatch(runners, /BLESSBOARD_OTP_PROVIDER\s*=\s*"(?:infobip|twilio)"/);
    assert.match(runners, /peekTestCode/);
    assert.match(runners, /lookupTestingPasswordResetDelivery/);
    assert.match(runners, /data-bb-member-dashboard="1"/);
    assert.match(runners, /Invalid or missing CSRF token/);
    assert.match(runners, /already linked to a BlessBoard church registration/);
    assert.match(runners, /data-bb-announcements="1"/);
    assert.match(runners, /Your password has been updated/);
    assert.match(runners, /data-ac-shell="staff-app"/);
    assert.match(runners, /Review new member/);
    for (const [bugId, runnerName] of BUGS) {
      assert.match(integration, new RegExp(bugId));
      assert.match(runners, new RegExp(`async function ${runnerName}`));
      const spec = bugId.startsWith("AC-") ? ac : bb;
      assertHoldBeforeNavigation(spec, bugId);
    }
    assert.match(runners, /module\.exports = \{/);
    for (const [, runnerName] of BUGS) {
      assert.match(runners, new RegExp(`${runnerName},`));
    }
  });

  it("does not treat a missing database authorization as a pass", () => {
    assert.equal(dbWritesAuthorized({}), false);
    assert.equal(
      dbWritesAuthorized({
        GETPRO_V13_ALLOW_DB_WRITES: "1",
        GETPRO_V13_DB_STAGES_AUTHORIZED: "0",
      }),
      false
    );
  });
});

function assertHoldBeforeNavigation(source, bugId) {
  const start = source.indexOf(`test("${bugId}`);
  assert.ok(start >= 0, `${bugId} browser test`);
  const next = source.indexOf("\n  test(", start + 10);
  const body = source.slice(start, next === -1 ? source.length : next);
  const holdAt = body.indexOf("hold(");
  const gotoAt = body.indexOf("page.goto");
  assert.ok(holdAt >= 0, `${bugId} must call hold`);
  assert.ok(gotoAt === -1 || holdAt < gotoAt, `${bugId} must hold before navigation`);
}
