"use strict";

const { describe, it } = require("node:test");
const { runGated, runBb04 } = require("./v13AuthorizedScenarios");

describe("BB-04 sermons integration", () => {
  it("persists one sermon and rejects a slash date and a non-HTTPS media URL", async (t) => {
    await runGated(t, "BB-04", runBb04);
  });
});
