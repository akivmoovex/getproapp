"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { runGated } = require("./v13AuthorizedScenarios");
const { runSharedOtpPersistence } = require("./g185SharedOtpPersistence");

describe("G185 shared OTP persistence", () => {
  it("persists challenges across two workers when the reviewed disposable schema is present", async (t) => {
    await runGated(t, "G185", async (pool, connectionString) => {
      const relation = await pool.query(`SELECT to_regclass('platform.otp_challenges') AS rel`);
      const buckets = await pool.query(`SELECT to_regclass('platform.otp_rate_buckets') AS rel`);
      if (!relation.rows[0].rel || !buckets.rows[0].rel) {
        const error = new Error(
          "BLOCKED_BY_SCHEMA: platform.otp_challenges is not present. Refusing to create it."
        );
        error.code = "BLOCKED_BY_SCHEMA";
        throw error;
      }
      assert.equal(
        fs.existsSync(path.join(__dirname, "../../../db/migrations/platform/048_otp_challenges.sql")),
        false,
        "reviewed disposable apply must not promote 048 into db/migrations"
      );
      await runSharedOtpPersistence(pool, connectionString);
    });
  });
});
