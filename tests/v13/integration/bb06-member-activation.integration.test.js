"use strict";

const { describe, it } = require("node:test");
const { runGated, runBb06 } = require("./v13AuthorizedScenarios");

describe("BB-06 member activation integration", () => {
  it("activates one member, rejects the replay, and signs that member in", async (t) => {
    await runGated(t, "BB-06", runBb06);
  });
});
