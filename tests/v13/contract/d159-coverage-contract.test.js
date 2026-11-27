"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..", "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("D159 coverage guards", () => {
  it("keeps the new browser and persistence files closed", () => {
    const spec = read("tests/e2e/v13/v13-d159-journeys.spec.js");
    const persistence = read("tests/v13/integration/d159-member-persistence.integration.test.js");
    for (const id of ["AC-PAT-01", "INV-01", "BB-06", "D14C-LIVE"]) assert.match(spec, new RegExp(id));
    assert.match(spec, /NOT_RUN/);
    assert.match(spec, /GETPRO_V13_OTP_LIVE_MAILBOX/);
    assert.doesNotMatch(spec, /api\.resend\.com/);
    assert.match(persistence, /runGated/);
    assert.match(persistence, /runBb06/);
    assert.match(persistence, /runInv01/);
    assert.match(persistence, /NOT_RUN/);
    assert.doesNotMatch(persistence, /new Pool\(/);
    const script = JSON.parse(read("package.json")).scripts["test:v13:contract"];
    assert.match(script, /^node --test --test-concurrency=1 tests\/v13\/contract\/\*\.test\.js tests\/v13\/unit\/\*\.test\.js/);
    assert.equal(script.includes("d159-member-persistence"), false);
  });
});
