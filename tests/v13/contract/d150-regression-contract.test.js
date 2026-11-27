"use strict";

/**
 * D150 source contracts for files that are implemented and must not run here.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "../../..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("D150 unexecuted suite contracts", () => {
  it("keeps browser journeys fail-closed until disposable browser authorization", () => {
    const spec = read("tests/e2e/v13/v13-d150-journeys.spec.js");
    for (const id of ["G224", "G229", "G266", "BB-05", "BB-04", "AC-PUB-01", "D14C", "CB-POSTING"]) {
      assert.match(spec, new RegExp(id));
    }
    assert.match(spec, /GETPRO_V13_BROWSER_AUTHORIZED/);
    assert.match(spec, /NOT_RUN/);
    assert.match(spec, /page\.on\("pageerror"/);
    assert.match(spec, /data-ac-lab-component/);
    assert.match(spec, /data-ac-rad-findings/);
    assert.doesNotMatch(spec, /api\.resend\.com/);
    assert.doesNotMatch(spec, /5432/);
  });

  it("keeps the database regression file behind the write gate", () => {
    const test = read("tests/v13/integration/d150-persistence.integration.test.js");
    assert.match(test, /dbWritesAuthorized/);
    assert.match(test, /NOT_RUN/);
    assert.match(test, /D25/);
    assert.match(test, /G224/);
    assert.match(test, /G229/);
    assert.doesNotMatch(test, /new Pool\(/);
    const script = read("package.json");
    assert.doesNotMatch(script, /d150-persistence/);
    assert.match(script, /test:v13:contract": "node --test --test-concurrency=1 tests\/v13\/contract\/\*\.test\.js tests\/v13\/unit\/\*\.test\.js/);
  });

  it("does not enable public booking, financial posting, or deliveryActivated", () => {
    const flags = read("src/activeclinic/communityBenefits/flags.js");
    assert.match(flags, /financialPostingEnabled/);
    const providers = read("src/platform/otp/otpProviders.js");
    assert.doesNotMatch(providers, /deliveryActivated:\s*true/);
    const booking = read("src/activeclinic/http/activeClinicPublicBookingRoutes.js");
    assert.match(booking, /publicBookingEnabled !== true/);
  });
});
