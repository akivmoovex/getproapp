"use strict";

const { describe, it } = require("node:test");
const { runGated, runBb02 } = require("./v13AuthorizedScenarios");

describe("BB-02 announcements integration", () => {
  it("publishes one church-owned announcement and hides it from another church", async (t) => {
    await runGated(t, "BB-02", runBb02);
  });
});
