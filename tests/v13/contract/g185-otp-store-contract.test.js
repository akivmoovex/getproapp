"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "../../..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("G185 OTP store contract", () => {
  it("keeps the reviewed SQL unapplied and the D16 assertion unchanged", () => {
    assert.equal(fs.existsSync(path.join(ROOT, "db/migrations/platform/048_otp_challenges.sql")), false);
    const sql = read("docs/qa/V2132_G181_OTP_CHALLENGES.sql");
    assert.match(sql, /NOT APPLIED/);
    assert.match(sql, /organization_id uuid NOT NULL/);
    assert.match(sql, /consumed boolean NOT NULL/);
    assert.match(sql, /last_sent_at/);
    assert.match(sql, /otp_rate_buckets/);
    const store = read("src/platform/otp/otpPostgresStore.js");
    assert.match(store, /consumed = false/);
    assert.match(store, /platform\.otp_challenges/);
    assert.match(store, /platform\.otp_rate_buckets/);
    assert.doesNotMatch(store, /CREATE TABLE/);
    const service = read("src/platform/otp/otpService.js");
    assert.match(service, /createUnavailableOtpStore/);
    assert.match(service, /sessionComplete: false/);
    const d16 = read("tests/v13/integration/v13AuthorizedScenarios.js");
    assert.match(d16, /platform\.otp_challenges is not present/);
    assert.match(d16, /verification alone grants no authenticated session/);
    assert.match(read("src/platform/http/moovexPlatformRuntimeServer.js"), /attachOtpDatabase/);
    assert.match(read("src/platform/email/resendSenderCatalog.js"), /notify\.pronline\.org/);
    assert.match(read("src/platform/email/resendSenderCatalog.js"), /qa-blessboard@pronline\.org/);
  });
});
