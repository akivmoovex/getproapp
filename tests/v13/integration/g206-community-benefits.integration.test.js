"use strict";

const { describe, it } = require("node:test");
const { runGated } = require("./v13AuthorizedScenarios");

describe("community benefits persistence", () => {
  it("reports BLOCKED_BY_MIGRATION and does not create community tables", async (t) => {
    await runGated(t, "COMMUNITY", async (pool) => {
      const names = [
        "activeclinic.community_memberships",
        "activeclinic.community_settlement_batches",
      ];
      for (const name of names) {
        const relation = await pool.query("SELECT to_regclass($1) AS rel", [name]);
        if (!relation.rows[0].rel) {
          const error = new Error(`BLOCKED_BY_MIGRATION: ${name} is not present. Refusing to create it.`);
          error.code = "BLOCKED_BY_MIGRATION";
          throw error;
        }
      }
      throw new Error("community benefits persistence is not authorized to continue");
    });
  });
});
