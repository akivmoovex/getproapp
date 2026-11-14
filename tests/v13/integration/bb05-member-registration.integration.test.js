"use strict";

const { describe, it } = require("node:test");
const { runGated, runBb05 } = require("./v13AuthorizedScenarios");

describe("BB-05 member registration integration", () => {
  it("stores one member and rejects a cross-church confirmation and a duplicate submit", async (t) => {
    await runGated(t, "BB-05", runBb05);
  });
});
