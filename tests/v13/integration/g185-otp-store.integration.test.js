"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { runGated } = require("./v13AuthorizedScenarios");
const { runSharedOtpPersistence } = require("./g185SharedOtpPersistence");

describe("G185 shared OTP persistence", () => {
  it("does not create the challenge table and runs only after a separate authorization", async (t) => {
    await runGated(t, "G185", async (pool) => {
      const relation = await pool.query(`SELECT to_regclass('platform.otp_challenges') AS rel`);
      const authorized = String(process.env.GETPRO_V13_OTP_PERSISTENCE_AUTHORIZED || "") === "1";
      if (!authorized) {
        assert.equal(relation.rows[0].rel, null);
        assert.equal(
          fs.existsSync(path.join(__dirname, "../../../db/migrations/platform/048_otp_challenges.sql")),
          false
        );
        return;
      }
      assert.ok(
        relation.rows[0].rel,
        "approved migration is missing; refusing to create platform.otp_challenges"
      );
      await runSharedOtpPersistence(pool);
    });
  });
});
