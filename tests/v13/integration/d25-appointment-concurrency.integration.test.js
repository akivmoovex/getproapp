"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { runGated } = require("./v13AuthorizedScenarios");

describe("D25 appointment persistence", () => {
  it("keeps simultaneous slot booking unexecuted", async (t) => {
    const result = await runGated(t, "APT-01-03", async () => {
      throw new Error("APT-01-03_NOT_IMPLEMENTED: slot capacity lock is not in the product");
    });
    assert.equal(result, "NOT_RUN");
  });

  it("keeps the staff-overlap race unexecuted", async (t) => {
    const result = await runGated(t, "D39-STAFF-OVERLAP-RACE", async () => {
      throw new Error(
        "BLOCKED_APPROVAL_REQUIRED: the overlap check is still outside the appointment transaction"
      );
    });
    assert.equal(result, "NOT_RUN");
  });
});
