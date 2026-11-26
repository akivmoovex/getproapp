"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { runGated } = require("./v13AuthorizedScenarios");
const { runG272EmailOtpPostgresLifecycle } = require("./g272EmailOtpPostgresLifecycle");

describe("G272 email OTP disposable PostgreSQL lifecycle", () => {
  it("persists a recovery challenge, completes once, rejects replay, and keeps Resend fail-closed", async (t) => {
    await runGated(t, "G272", async (pool, connectionString) => {
      const result = await runG272EmailOtpPostgresLifecycle({ pool, connectionString });
      assert.equal(result.ok, true, result.reason || "lifecycle failed");
      assert.equal(result.completedOnce, true);
      assert.equal(result.replayRejected, true);
      assert.equal(result.mailboxDelivery, "NOT_EXECUTED");
      assert.equal(result.resendAcceptance, "BLOCKED_MISSING_CREDENTIALS");
    });
  });
});
