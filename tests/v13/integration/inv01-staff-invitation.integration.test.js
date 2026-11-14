"use strict";

const { describe, it } = require("node:test");
const { runGated, runInv01 } = require("./v13AuthorizedScenarios");

describe("INV-01 staff invitation integration", () => {
  it("accepts one invitation, signs in once, and denies role escalation and the other church", async (t) => {
    await runGated(t, "INV-01", runInv01);
  });
});
